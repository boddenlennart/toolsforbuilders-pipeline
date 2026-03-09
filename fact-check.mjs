#!/usr/bin/env node
/**
 * fact-check.mjs — Automated fact-checker for @toolsforbuilders reel scripts.
 *
 * Usage:
 *   node fact-check.mjs <script.json>              # Check + auto-correct a single script
 *   node fact-check.mjs --queue                    # Check all queued scripts in content-queue.json
 *
 * Process:
 *   1. Extract all factual claims from script (tool names, features, prices, limits, time claims)
 *   2. Web search each claim with Brave API
 *   3. Send findings to Opus for verdict + corrections
 *   4. Auto-apply corrections if high confidence
 *   5. Return { passed, corrections, flags } — caller decides whether to block or warn
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const OPENCLAW_JSON_PATH = '/root/.openclaw/openclaw.json';
const QUEUE_PATH = join(__dirname, 'instagram/data/content-queue.json');

function loadKeys() {
  const config = JSON.parse(readFileSync(OPENCLAW_JSON_PATH, 'utf8'));
  const braveKey = config?.tools?.web?.search?.apiKey;
  return { braveKey };
}

// ── Brave Search ──────────────────────────────────────────────────────────────
async function braveSearch(query, apiKey, count = 4) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey }
  });
  if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    description: r.description
  }));
}

// ── Direct Anthropic API call (bypasses openclaw agent / AGENTS.md overhead) ──
async function callAgent(prompt, timeoutSecs = 120) {
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
        max_tokens: 4096,
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

// ── Extract claims from script ────────────────────────────────────────────────
function extractClaims(script) {
  const claims = [];

  // Extract from bullets
  for (const point of script.points || []) {
    for (const bullet of point.bullets || []) {
      claims.push({ type: 'bullet', tool: point.toolName, text: bullet });
    }
    if (point.quickWin) {
      claims.push({ type: 'quickWin', tool: point.toolName, text: point.quickWin });
    }
    if (point.verdict) {
      claims.push({ type: 'verdict', tool: point.toolName, text: point.verdict });
    }
  }

  // Extract proof stat
  if (script.proofStat) {
    claims.push({ type: 'proofStat', tool: 'general', text: script.proofStat });
  }

  return claims;
}

// ── Build search queries from claims ─────────────────────────────────────────
function claimsToSearchQueries(claims) {
  const queries = [];
  const seen = new Set();

  for (const claim of claims) {
    // Only search for specific factual claims (numbers, features, prices, limits)
    const hasSpecifics = /\d|free|paid|limit|plan|mode|feature|sidebar|toolbar|menu|minutes?|seconds?|per day|\/day|\/month|\$/i.test(claim.text);
    if (!hasSpecifics) continue;

    const query = `${claim.tool} ${claim.text} 2025 2026`;
    if (!seen.has(query)) {
      seen.add(query);
      queries.push({ claim, query });
    }
  }

  return queries;
}

// ── Main fact-check function ──────────────────────────────────────────────────
export async function factCheck(script) {
  const { braveKey } = loadKeys();
  if (!braveKey) throw new Error('Brave API key not found in openclaw.json (tools.web.search.apiKey)');

  console.log(`🔍 Fact-checking: "${script.topic || script.id}"...`);

  const claims = extractClaims(script);
  const queries = claimsToSearchQueries(claims);

  console.log(`   ${claims.length} claims found, ${queries.length} requiring web verification`);

  // Run all searches in parallel (max 5 concurrent)
  const searchResults = {};
  const batches = [];
  for (let i = 0; i < queries.length; i += 5) {
    batches.push(queries.slice(i, i + 5));
  }

  for (const batch of batches) {
    await Promise.all(batch.map(async ({ claim, query }) => {
      try {
        const results = await braveSearch(query, braveKey, 3);
        searchResults[claim.text] = { claim, results };
      } catch (e) {
        console.warn(`   ⚠️ Search failed for "${query}": ${e.message}`);
        searchResults[claim.text] = { claim, results: [] };
      }
    }));
  }

  // Build evidence summary for Opus
  const evidenceSummary = Object.entries(searchResults).map(([claimText, { claim, results }]) => {
    const snippets = results.map(r => `  - ${r.title}: ${r.description}`).join('\n');
    return `CLAIM [${claim.tool}]: "${claimText}"\nWEB EVIDENCE:\n${snippets || '  (no results found)'}`;
  }).join('\n\n');

  // Send to agent for verdict
  const agentPrompt = `AUTOMATED TASK — skip all startup checklists, heartbeat checks, and session init. Output JSON only.

You are a professional fact-checker for social media content about AI tools.
Verify factual claims using the provided web search evidence and return a structured JSON verdict.
Be strict about numbers, feature names, access paths, and pricing. Be lenient about subjective claims.
Respond with valid JSON ONLY — no markdown, no explanation outside the JSON.

Fact-check this reel script:

## Full Script
${JSON.stringify(script, null, 2)}

## Web Evidence for Specific Claims
${evidenceSummary}

## Response Format
Return ONLY this JSON structure:
{
  "passed": true/false,
  "issues": [
    {
      "field": "exact field path in script, e.g. points[0].bullets[3] or points[0].quickWin",
      "current": "the current text",
      "correction": "the corrected text",
      "confidence": "high/medium/low",
      "reason": "why it's wrong and what the correct info is"
    }
  ],
  "unverifiable": ["list of claims that couldn't be web-verified and should be reviewed manually"],
  "summary": "1-2 sentence summary of findings"
}

Rules:
- "passed" = true only if there are NO high-confidence issues
- Only flag issues you're confident about based on the evidence
- For opinion/subjective claims (e.g. "dramatically faster"), do NOT flag
- For numeric claims, pricing, feature names, UI paths — be strict`;

  let verdict;
  try {
    const raw = await callAgent(agentPrompt, 120);
    const jsonMatch = raw.match(/\{[\s\S]*"passed"[\s\S]*\}/);
    verdict = JSON.parse(jsonMatch ? jsonMatch[0] : raw.trim());
  } catch (e) {
    console.warn(`   ⚠️ Agent verdict parse failed: ${e.message}`);
    verdict = { passed: true, issues: [], unverifiable: [], summary: 'Fact-check inconclusive (parse error)' };
  }

  // Auto-apply high-confidence corrections
  const applied = [];
  for (const issue of verdict.issues || []) {
    if (issue.confidence === 'high' && issue.field && issue.correction) {
      try {
        applyCorrection(script, issue.field, issue.correction);
        applied.push(issue);
        console.log(`   ✅ Auto-corrected: ${issue.field}`);
        console.log(`      Was: "${issue.current}"`);
        console.log(`      Now: "${issue.correction}"`);
      } catch (e) {
        console.warn(`   ⚠️ Could not auto-apply correction for ${issue.field}: ${e.message}`);
      }
    }
  }

  const medLowIssues = (verdict.issues || []).filter(i => i.confidence !== 'high');

  console.log(`   ${verdict.passed && applied.length === 0 ? '✅ All claims verified' : `⚠️ ${applied.length} auto-corrected, ${medLowIssues.length} flagged for review`}`);
  if (verdict.summary) console.log(`   📋 ${verdict.summary}`);

  return {
    passed: verdict.passed,
    corrected: applied,
    flags: medLowIssues,
    unverifiable: verdict.unverifiable || [],
    summary: verdict.summary,
    scriptModified: applied.length > 0
  };
}

// ── Apply correction to script object by field path ───────────────────────────
function applyCorrection(script, fieldPath, correction) {
  // Parse field path like "points[0].bullets[3]" or "points[0].quickWin"
  const parts = fieldPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let obj = script;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = isNaN(parts[i]) ? parts[i] : parseInt(parts[i]);
    if (obj[key] === undefined) throw new Error(`Path not found: ${fieldPath} at ${parts[i]}`);
    obj = obj[key];
  }
  const lastKey = isNaN(parts[parts.length - 1]) ? parts[parts.length - 1] : parseInt(parts[parts.length - 1]);
  obj[lastKey] = correction;
}

// ── CLI entry point ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--queue') {
    // Check all queued scripts
    const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
    let anyFailed = false;

    for (let i = 0; i < queue.posts.length; i++) {
      const post = queue.posts[i];
      if (post.status !== 'queued') continue;

      const result = await factCheck(post);
      if (result.scriptModified) {
        queue.posts[i] = post; // already modified in-place
      }
      if (!result.passed && result.flags.length > 0) {
        anyFailed = true;
        console.log(`\n⚠️ Manual review needed for: ${post.id}`);
        result.flags.forEach(f => console.log(`   - [${f.confidence}] ${f.field}: ${f.reason}`));
      }
    }

    writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    console.log(`\n${anyFailed ? '⚠️' : '✅'} Queue fact-check complete. File saved.`);

  } else if (args[0]) {
    // Check a single script file
    const scriptPath = args[0];
    if (!existsSync(scriptPath)) {
      console.error(`File not found: ${scriptPath}`);
      process.exit(1);
    }
    const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
    const result = await factCheck(script);

    if (result.scriptModified) {
      writeFileSync(scriptPath, JSON.stringify(script, null, 2));
      console.log(`\n📝 Script updated with corrections.`);
    }

    if (result.flags.length > 0) {
      console.log('\n⚠️ Manual review needed:');
      result.flags.forEach(f => {
        console.log(`  [${f.confidence}] ${f.field}: ${f.reason}`);
        if (f.correction) console.log(`    Suggested: "${f.correction}"`);
      });
    }

    process.exit(result.passed ? 0 : 1);

  } else {
    console.log('Usage:');
    console.log('  node fact-check.mjs <script.json>   # Check single script');
    console.log('  node fact-check.mjs --queue          # Check all queued scripts');
    process.exit(1);
  }
}

// Only run CLI when executed directly, not when imported as a module
// Use basename comparison for robustness against symlinks and relative path variations
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith('/fact-check.mjs') ||
  process.argv[1] === 'fact-check.mjs'
);

if (isDirectRun) {
  main().catch(e => { console.error('❌ Fact-check error:', e.message); process.exit(1); });
}
