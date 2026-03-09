#!/usr/bin/env node
/**
 * weekly-content-research.mjs — Single Sunday job for all content preparation.
 * Runs: Sunday 20:00 UTC via PM2 cron.
 *
 * Phase 1 — KB Refresh:
 *   Web-search priority tools for pricing/feature changes.
 *   Update data/kb/index.json and append findings to content-research.md.
 *
 * Phase 2 — New Script Generation:
 *   Read published archive + queue to know all covered topics.
 *   Generate 7 new reel scripts on fresh topics.
 *   Append to content-queue.json.
 *
 * Phase 3 — Notify:
 *   Telegram summary to Lennart (topic 3) with KB changes + new scripts.
 *
 * Single source of truth: content-research.md
 * The KB index feeds into it. Scripts draw from it. Nothing else matters.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  queue:        join(__dirname, 'instagram/data/content-queue.json'),
  archive:      join(__dirname, 'instagram/data/archive/published.json'),
  research:     join(__dirname, 'instagram/data/content-research.md'),
  strategy:     join(__dirname, 'instagram/data/content-strategy.md'),
  kbIndex:      join(__dirname, 'instagram/data/kb/index.json'),
  kbDir:        join(__dirname, 'instagram/data/kb'),
  logs:         join(__dirname, 'logs'),
  kbRefreshScript: join(__dirname, 'kb-refresh.mjs'),
};

const TG_CHAT_ID  = '-1003879867373';
const TG_TOPIC_ID = 3;

function getConfig() {
  return JSON.parse(readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
}
const TG_API = `https://api.telegram.org/bot${getConfig()?.channels?.telegram?.botToken}`;

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

async function callAgent(prompt, timeoutSecs = 180) {
  // Read Anthropic token directly from OpenClaw auth profiles — bypasses AGENTS.md/heartbeat overhead
  const authProfiles = JSON.parse(readFileSync('/root/.openclaw/agents/main/agent/auth-profiles.json', 'utf8'));
  const token = authProfiles.profiles['anthropic:default']?.token;
  if (!token) throw new Error('No Anthropic token found in auth-profiles.json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSecs * 1000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error(`Empty reply from Anthropic. Raw: ${JSON.stringify(data).slice(0, 300)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  mkdirSync(PATHS.logs, { recursive: true });
  appendFileSync(join(PATHS.logs, `weekly-research-${new Date().toISOString().slice(0,10)}.log`), line + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// KB Loading Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load a single tool's KB markdown file
 * @param {string} slug - Tool slug (e.g., 'make', 'n8n')
 * @returns {string|null} - KB content or null if not found
 */
function loadToolKB(slug) {
  const kbFile = join(PATHS.kbDir, `${slug}.md`);
  if (!existsSync(kbFile)) {
    return null;
  }
  return readFileSync(kbFile, 'utf8');
}

/**
 * Extract lastVerified date from KB frontmatter
 * @param {string} content - KB markdown content
 * @returns {string|null} - Date string or null
 */
function extractKbDate(content) {
  const match = content.match(/last_verified:\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Load KB files for a list of tools and combine into context string
 * @param {string[]} tools - Array of tool slugs
 * @returns {string} - Combined KB context string
 */
function loadRelevantKBs(tools) {
  const kbEntries = [];
  
  for (const slug of tools) {
    const content = loadToolKB(slug);
    if (content) {
      const verifiedDate = extractKbDate(content) || 'unknown';
      const toolName = slug.charAt(0).toUpperCase() + slug.slice(1);
      kbEntries.push(`=== KB: ${toolName} (verified ${verifiedDate}) ===\n${content}`);
    }
  }
  
  if (kbEntries.length === 0) {
    return '(No KB files loaded)';
  }
  
  return kbEntries.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: KB Refresh
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_TOOLS = ['claude', 'gemini', 'chatgpt', 'perplexity', 'notebooklm', 'n8n', 'descript', 'beehiiv'];
const ROTATE_TOOLS   = ['notion-ai', 'grammarly', 'gamma', 'runway', 'zapier', 'make', 'canva', 'otter-ai', 'buffer', 'elevenlabs', 'heygen', 'suno'];
const KB_PRIORITY_TOOLS = ['claude', 'chatgpt', 'gemini', 'make', 'n8n', 'zapier']; // Tools to refresh via kb-refresh.mjs

function getToolsToRefreshThisWeek() {
  const week = Math.ceil(new Date().getDate() / 7);
  const rotating = ROTATE_TOOLS.filter((_, i) => i % 4 === (week - 1) % 4);
  return [...PRIORITY_TOOLS, ...rotating];
}

function loadKbIndex() {
  return existsSync(PATHS.kbIndex) ? JSON.parse(readFileSync(PATHS.kbIndex, 'utf8')) : { tools: [] };
}

function saveKbIndex(index) {
  writeFileSync(PATHS.kbIndex, JSON.stringify(index, null, 2));
}

function webSearch(query) {
  // Use openclaw web_search via CLI or direct brave API if available
  try {
    const result = spawnSync('openclaw', ['search', query, '--json'], { encoding: 'utf8', timeout: 15000 });
    if (result.status === 0) return result.stdout;
  } catch {}
  // Fallback: just return empty — the Claude call will do its own search
  return '';
}

async function refreshKb() {
  log('Phase 1: KB Refresh starting...');
  const tools = getToolsToRefreshThisWeek();
  const kb = loadKbIndex();
  const changes = [];

  for (const slug of tools) {
    const entry = kb.tools?.find(t => t.slug === slug) || { slug, name: slug };
    const lastVerified = entry.lastVerified ? new Date(entry.lastVerified) : null;
    const daysSince = lastVerified ? Math.floor((Date.now() - lastVerified) / 86400000) : 999;

    if (daysSince < 7) {
      log(`  ⏭️  ${slug}: verified ${daysSince}d ago — skip`);
      continue;
    }

    // For priority KB tools, run the full kb-refresh.mjs script
    if (KB_PRIORITY_TOOLS.includes(slug)) {
      log(`  🔍 Running kb-refresh.mjs for ${slug}...`);
      try {
        const refreshResult = spawnSync('node', [PATHS.kbRefreshScript, slug], {
          encoding: 'utf8',
          timeout: 120000, // 2 min timeout per tool
          maxBuffer: 5 * 1024 * 1024
        });
        if (refreshResult.status === 0) {
          log(`  ✅ KB refreshed: ${slug}`);
          changes.push(slug);
        } else {
          log(`  ⚠️ KB refresh failed for ${slug}: ${(refreshResult.stderr || refreshResult.stdout || '').slice(0, 200)}`);
          // Still mark as checked to avoid retry loops
          entry.lastCheckedInWeeklyRun = new Date().toISOString();
        }
      } catch (e) {
        log(`  ❌ KB refresh error for ${slug}: ${e.message}`);
      }
    } else {
      // For non-priority tools, just mark as checked (old behavior)
      log(`  🔍 Marking ${slug} as checked...`);
      entry.lastVerified = new Date().toISOString().slice(0, 10);
      entry.lastCheckedInWeeklyRun = new Date().toISOString();
      if (!kb.tools) kb.tools = [];
      const idx = kb.tools.findIndex(t => t.slug === slug);
      if (idx >= 0) kb.tools[idx] = entry; else kb.tools.push(entry);
      changes.push(slug);
    }
  }

  saveKbIndex(kb);
  log(`Phase 1: Done. Checked ${tools.length} tools, refreshed ${changes.length}.`);
  return changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: New Script Generation via openclaw chat
// ─────────────────────────────────────────────────────────────────────────────

function getCoveredTopics() {
  const covered = [];
  if (existsSync(PATHS.archive)) {
    const a = JSON.parse(readFileSync(PATHS.archive, 'utf8'));
    (a.published || []).forEach(p => covered.push({ id: p.id, topic: p.topic, status: 'published', postedAt: p.postedAt }));
  }
  if (existsSync(PATHS.queue)) {
    const q = JSON.parse(readFileSync(PATHS.queue, 'utf8'));
    (q.posts || []).forEach(p => covered.push({ id: p.id, topic: p.topic, status: p.status }));
  }
  return covered;
}

/**
 * trimTTS — auto-trim TTS segments to meet quality-gate limits before queuing.
 * Per-segment limits match quality-gate.mjs: hookTTS ≤ 18, agitateTTS ≤ 18,
 * proofTTS ≤ 20, ctaTTS ≤ 13, points[].tts ≤ 27, total ≤ 125.
 * Truncates at sentence boundary (last '.' before word limit) when possible.
 */
function trimTTS(script) {
  const SEGMENT_LIMITS = {
    hookTTS:    18,
    agitateTTS: 18,
    proofTTS:   20,
    ctaTTS:     13,
    pointTTS:   27,
  };
  const MAX_TOTAL = 125;
  const wc = t => (t || '').trim().split(/\s+/).filter(Boolean).length;

  // Gather all TTS segment refs (mutate in place via setters)
  const getSegs = (s) => [
    { field: 'hookTTS',    max: SEGMENT_LIMITS.hookTTS,    get: () => s.hookTTS || '',    set: v => { s.hookTTS = v; } },
    { field: 'agitateTTS', max: SEGMENT_LIMITS.agitateTTS, get: () => s.agitateTTS || '', set: v => { s.agitateTTS = v; } },
    ...((s.points || []).map((p, i) => ({
      field: `points[${i}].tts`,
      max:   SEGMENT_LIMITS.pointTTS,
      get: () => p.tts || '',
      set: v => { p.tts = v; },
    }))),
    { field: 'proofTTS',   max: SEGMENT_LIMITS.proofTTS,   get: () => s.proofTTS || '',   set: v => { s.proofTTS = v; } },
    { field: 'ctaTTS',     max: SEGMENT_LIMITS.ctaTTS,     get: () => s.ctaTTS || '',     set: v => { s.ctaTTS = v; } },
  ];

  const trimSegment = (text, maxWords) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text;
    // Find last sentence boundary (period) at or before maxWords
    const slice = words.slice(0, maxWords);
    const lastDot = slice.map((w, i) => ({ w, i })).filter(({ w }) => w.endsWith('.')).pop();
    const cutAt = lastDot ? lastDot.i + 1 : maxWords;
    return words.slice(0, cutAt).join(' ');
  };

  const id = script.id || '(unknown)';
  const segs = getSegs(script);

  // Pass 1: trim any segment exceeding its per-segment limit
  for (const seg of segs) {
    const before = seg.get();
    const beforeWc = wc(before);
    if (beforeWc > seg.max) {
      const after = trimSegment(before, seg.max);
      seg.set(after);
      console.warn(`⚠️ TTS trimmed on ${id}: ${seg.field} ${beforeWc}→${wc(after)} words`);
    }
  }

  // Pass 2: trim total > MAX_TOTAL — hookTTS is protected (trimmed last)
  // Priority: points[].tts → proofTTS → agitateTTS → ctaTTS → hookTTS
  let total = segs.reduce((sum, seg) => sum + wc(seg.get()), 0);
  while (total > MAX_TOTAL) {
    // Find longest segment, deprioritise hookTTS by halving its effective weight
    const longest = segs
      .map(seg => ({ seg, w: wc(seg.get()), isHook: seg.field === 'hookTTS' }))
      .filter(({ w }) => w > 5)
      .sort((a, b) => (b.isHook ? b.w * 0.5 : b.w) - (a.isHook ? a.w * 0.5 : a.w))[0];
    if (!longest) break;

    const before = longest.seg.get();
    const beforeWc = longest.w;
    const targetWc = Math.max(5, beforeWc - (total - MAX_TOTAL));
    const after = trimSegment(before, targetWc);
    longest.seg.set(after);
    console.warn(`⚠️ TTS trimmed on ${id}: ${longest.seg.field} ${beforeWc}→${wc(after)} words (total trim)`);
    total = segs.reduce((sum, seg) => sum + wc(seg.get()), 0);
  }

  return script;
}

function appendToQueue(scripts) {
  const queue = existsSync(PATHS.queue)
    ? JSON.parse(readFileSync(PATHS.queue, 'utf8'))
    : { posts: [] };
  const before = (queue.posts || []).filter(p => p.status === 'needs-review' || p.status === 'queued').length;
  // Preserve existing status (e.g., 'needs-review'), default to 'needs-review' if not set
  scripts.forEach(s => { 
    if (!s.status) s.status = 'needs-review';
    trimTTS(s);  // enforce TTS limits before queuing
    queue.posts.push(s); 
  });
  queue.updatedAt = new Date().toISOString();
  writeFileSync(PATHS.queue, JSON.stringify(queue, null, 2));
  const after = queue.posts.filter(p => p.status === 'needs-review' || p.status === 'queued').length;
  log(`Queue: ${before} → ${after} pending scripts (all marked needs-review)`);
}

function appendResearchFindings(findings, refreshedTools) {
  if (!findings?.trim() && !refreshedTools?.length) return;
  const date = new Date().toISOString().slice(0, 10);
  let section = `\n\n---\n\n## Weekly Update — ${date}\n`;
  if (refreshedTools?.length) section += `\n**KB tools refreshed this week:** ${refreshedTools.join(', ')}\n`;
  if (findings?.trim()) section += `\n${findings.trim()}\n`;
  section += `\n### Do Not Repeat (Queued — added this week)\n`;
  // Will be filled in by the calling code
  appendFileSync(PATHS.research, section);
  log('Research findings appended to content-research.md');
}

async function generateScripts(covered, refreshedTools) {
  log('Phase 2: Generating 7 new scripts via OpenClaw agent...');

  const research = existsSync(PATHS.research) ? readFileSync(PATHS.research, 'utf8').slice(-8000) : '';
  const strategy = existsSync(PATHS.strategy) ? readFileSync(PATHS.strategy, 'utf8').slice(-4000) : '';
  const coveredList = covered.map(t => `- [${t.status}] ${t.topic} (id: ${t.id})`).join('\n');

  // Load KB files for all tools that might be featured
  const allToolsToLoad = [...new Set([...PRIORITY_TOOLS, ...ROTATE_TOOLS, ...KB_PRIORITY_TOOLS])];
  const kbContext = loadRelevantKBs(allToolsToLoad);
  log(`  Loaded KB context for ${allToolsToLoad.length} tools`);

  // Load performance context if available
  const perfContextPath = join(PATHS.kbDir, '..', 'performance-context.md');
  const perfContext = existsSync(perfContextPath) ? readFileSync(perfContextPath, 'utf8') : '(No performance data yet — new channel)';

  const prompt = `AUTOMATED TASK — skip all startup checklists, heartbeat checks, and session init. Do not read HEARTBEAT.md or any memory files. Your ONLY job is to output the JSON requested below. Do not include any preamble or explanation — output JSON and nothing else.

You are a content strategist for @toolsforbuilders, an AI tools account for solopreneurs. Generate Reel scripts that are specific, non-obvious, and genuinely useful to someone who has used AI tools for 6 months.

Generate 7 new weekly Reel scripts for @toolsforbuilders.

## CRITICAL: Verified Knowledge Base

The following KB entries are your ONLY source for specific claims (prices, limits, feature names, operation counts). 

Rules:
1. ONLY use numbers/claims that appear verbatim in the "Verified claims" sections below
2. NEVER use numbers from your training data — they are likely outdated
3. If a claim appears in "Banned claims" — do not use it, ever
4. If you don't have a verified number for something, use qualitative language ("starts at", "affordable", "cheaper than alternatives") instead of inventing a number
5. Every script's "claims" array must map each factual claim to its KB source

## VERIFIED KB DATA (loaded from disk, verified this week)

${kbContext}

## CONTENT STRATEGY

## Already Covered — DO NOT REPEAT ANY OF THESE
${coveredList}

## Content Research Knowledge Base (excerpt)
${research}

## Content Strategy Rules (excerpt)
${strategy}

## KB Tools Refreshed This Week
${refreshedTools.join(', ')}

## Performance Data (what's working on our channel)

${perfContext}

Use this data to: prioritize pillars with higher save rates, double down on hook styles that drive profile visits. If confidence is LOW or INSUFFICIENT, continue testing all pillars equally.

## Requirements
- Pillar rotation: Comparison → Hidden Feature → Workflow → Time/Money Math → Myth Bust → Workflow → Comparison
- **Comparison pillar MANDATORY rules** (applies to any script with pillar "Comparison"):
  - hookHeadline MUST show both tool names with their key metric side by side (price, limit, execution count)
  - hookTTS first sentence MUST name both tools — never open talking only about the losing tool
  - The recommended/winning tool must be named by the end of hookTTS
  - Both tool names must appear in points[].toolName — Comparison scripts need ≥2 distinct toolName values across their points
  - If you cannot show a concrete measurable difference between two tools using KB-verified numbers → skip the Comparison and pick a different pillar
- Every script passes the 6-month test: a regular AI user would say "I didn't know that"
- No topic overlap with already-covered list
- One concrete specific detail per step (exact number, exact prompt, named constraint)
- TTS sentences end on strong declarative words — never past-tense verbs or prepositions as final word
- Split sentences over 20 words into two
- Pattern-break before last step when 3+ steps: "Last step — and this is the one people skip."
- Locked CTA: "Save this before you forget it. I drop one of these every day."
- Proof slide angle must match the reel's hook — if the hook is about speed, proof = time saved. If it's about cost, proof = money saved. Never default to "it's free" unless cost IS the hook.
- Free vs paid is not the story — the workflow outcome is the story. Mention pricing as context, not as the value prop.
- Total TTS words per script: MAX 125 words total (hard limit — Eric voice at ~2.30 w/s avg means 125 words ≈ 47s)
- Per-segment word targets (do not exceed): hookTTS ≤ 18, agitateTTS ≤ 18, each points[].tts ≤ 27, proofTTS ≤ 20, ctaTTS = 13 (locked)
- EVERY factual claim (price, limit, feature) MUST come from the KB "Verified claims" sections

Return ONLY a valid JSON object, no markdown wrapper, no explanation:
{"scripts":[...],"newResearchFindings":"markdown or empty string"}

Each script must include a "claims" array tracking all factual claims:
{
  "id":"reel-[slug]",
  "pillar":"Comparison|Hidden Feature|Workflow|Time/Money Math|Myth Bust",
  "status":"queued",
  "topic":"short description",
  "hookHeadline":"max 10 words",
  "hookSub":"max 8 words",
  "hookTTS":"spoken",
  "agitateMain":"max 8 words",
  "agitateBridge":"max 8 words",
  "agitateTTS":"spoken",
  "points":[{"label":"STEP 01","toolName":"X","verdict":"max 10 words","bullets":["..."],"quickWin":"→ url","tts":"spoken with one concrete detail"}],
  "proofStat":"claim",
  "proofContext":"2-3 lines",
  "proofTTS":"spoken",
  "ctaTTS":"Save this before you forget it. I drop one of these every day.",
  "claims":[
    {"text":"exact claim text","source":"kb:tool-slug.verified_claims","confidence":"high|medium|low|unverified"}
  ]
}

Confidence levels:
- "high" = claim verbatim in KB verified claims
- "medium" = claim derived from KB but not verbatim  
- "low" = no KB source found but likely true
- "unverified" = AI generated without KB backing`;

  const raw = await callAgent(prompt, 180);
  const jsonMatch = raw.match(/\{[\s\S]*"scripts"[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in agent reply. Got: ${raw.slice(0, 300)}`);
  return JSON.parse(jsonMatch[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Telegram Notification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarize confidence levels for a script's claims
 * @param {Object} script - Script with claims array
 * @returns {string} - Summary like "all HIGH" or "1 MEDIUM, 2 LOW"
 */
function summarizeConfidence(script) {
  const claims = script.claims || [];
  if (claims.length === 0) return 'no claims tracked';
  
  const counts = { high: 0, medium: 0, low: 0, unverified: 0 };
  for (const c of claims) {
    const level = (c.confidence || 'unverified').toLowerCase();
    if (counts[level] !== undefined) counts[level]++;
    else counts.unverified++;
  }
  
  if (counts.high === claims.length) return 'all claims HIGH confidence';
  if (counts.unverified > 0) return `${counts.unverified} UNVERIFIED claim${counts.unverified > 1 ? 's' : ''}`;
  
  const parts = [];
  if (counts.medium > 0) parts.push(`${counts.medium} MEDIUM`);
  if (counts.low > 0) parts.push(`${counts.low} LOW`);
  return parts.join(', ') + ' confidence';
}

async function notify(scripts, kbChanges, errors) {
  const date = new Date().toISOString().slice(0, 10);
  const kbLine = kbChanges.length ? `🔄 KB refreshed: ${kbChanges.join(', ')}` : '🔄 KB: no updates needed';
  
  // Build script list with confidence summaries
  const scriptList = scripts.map((s, i) => {
    const conf = summarizeConfidence(s);
    return `${i+1}. [${s.pillar}] ${s.topic} — ${conf}`;
  }).join('\n');
  
  const errorLine = errors.length ? `\n⚠️ Errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}` : '';

  const text = `📅 Weekly Content Prep — ${date}

${kbLine}

📋 ${scripts.length} scripts queued for your review:
${scriptList}
${errorLine}

⚠️ All scripts need manual approval before posting.
Review content-queue.json — all marked needs-review.`;

  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      message_thread_id: TG_TOPIC_ID,
      text,
      parse_mode: 'HTML',
    }),
  });
  log('Telegram notification sent');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Guard: only run on Sunday (day 0) at or after 20:00 UTC. PM2 cron jobs execute on startup too.
  const day = new Date().getUTCDay();
  const hour = new Date().getUTCHours();
  if (process.env.FORCE_RUN !== '1' && (day !== 0 || hour < 20)) {
    log(`Startup guard: not Sunday 20:00 UTC (day=${day}, hour=${hour}). Exiting.`);
    return;
  }
  log('=== Weekly Content Research Started ===');
  const errors = [];

  // Phase 0: Pull and interpret analytics (non-fatal)
  try {
    log('Phase 0: Pulling analytics for recent posts...');
    const { pullAnalytics } = await import('./analytics-pull.mjs');
    const { interpretAnalytics } = await import('./analytics-interpret.mjs');
    await pullAnalytics();
    await interpretAnalytics();
    log('Analytics pull and interpretation complete');
  } catch (err) {
    log(`⚠️ Analytics pull failed (non-critical): ${err.message}`);
    // Non-fatal — continue with generation
  }

  // Phase 1: KB
  let kbChanges = [];
  try {
    kbChanges = await refreshKb();
  } catch (err) {
    log(`❌ KB refresh failed: ${err.message}`);
    errors.push(`KB refresh: ${err.message}`);
  }

  // Phase 2: Scripts
  const covered = getCoveredTopics();
  log(`Covered topics: ${covered.length}`);

  let scripts = [];
  let newFindings = '';
  try {
    const result = await generateScripts(covered, kbChanges);
    scripts = result.scripts || [];
    newFindings = result.newResearchFindings || '';

    if (scripts.length > 0) {
      // ── Fact-check all scripts before adding to queue ──────────────────────
      log('Phase 2b: Fact-checking generated scripts with Opus + Brave Search...');
      const { factCheck } = await import('./fact-check.mjs');
      const verified = [];
      const factCheckErrors = [];
      for (const script of scripts) {
        try {
          const result = await factCheck(script);
          verified.push(script); // script is modified in-place if corrections applied
          if (result.corrected.length > 0) {
            log(`  ✅ Auto-corrected ${result.corrected.length} claim(s) in: ${script.id}`);
          }
          if (result.flags.length > 0) {
            factCheckErrors.push(`  ⚠️ ${script.id}: ${result.flags.map(f => f.reason).join('; ')}`);
          }
        } catch (e) {
          log(`  ⚠️ Fact-check failed for ${script.id}: ${e.message} — adding anyway`);
          verified.push(script);
        }
      }
      if (factCheckErrors.length > 0) {
        log('Manual review needed:\n' + factCheckErrors.join('\n'));
        errors.push(...factCheckErrors);
      }
      log(`Fact-check complete: ${verified.length}/${scripts.length} scripts verified`);

      // Set ALL scripts to 'needs-review' status (no auto-publish)
      for (const script of verified) {
        script.status = 'needs-review';
      }

      appendToQueue(verified);
      appendResearchFindings(newFindings, kbChanges);

      // Append new topic IDs to the Do Not Repeat section in research.md
      const doNotRepeat = verified.map(s => `- ${s.topic} (id: ${s.id})`).join('\n');
      appendFileSync(PATHS.research, doNotRepeat + '\n');
    }
  } catch (err) {
    log(`❌ Script generation failed: ${err.message}`);
    errors.push(`Script generation: ${err.message}`);
  }

  // Phase 3: Notify
  await notify(scripts, kbChanges, errors);

  log(`=== Done. ${scripts.length} scripts added, ${kbChanges.length} KB tools refreshed ===`);

  // Ping Uptime Kuma — confirms weekly research ran successfully
  try {
    await fetch('http://localhost:3002/api/push/ab3392b38489998b7f45751878f0c8d8?status=up&msg=OK');
  } catch (e) { /* non-critical */ }
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
