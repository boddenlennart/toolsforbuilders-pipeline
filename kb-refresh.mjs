#!/usr/bin/env node
/**
 * kb-refresh.mjs — Refresh KB markdown files using live web search + AI extraction.
 *
 * Usage:
 *   node kb-refresh.mjs <tool-slug>       # Refresh a single tool's KB
 *   node kb-refresh.mjs --all-priority    # Refresh priority tools (claude, chatgpt, gemini, make, n8n, zapier)
 *   node kb-refresh.mjs --due             # Refresh tools where lastVerified > 7 days ago
 *
 * Process:
 *   1. Read existing KB markdown file for the tool
 *   2. Run 3 Brave searches for pricing, features, and reviews
 *   3. Call AI to extract and update KB sections
 *   4. Update the markdown file with new verified claims, banned claims, and recent changes
 *   5. Update last_verified date in frontmatter and index.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────────────────
const KB_DIR = join(__dirname, 'instagram/data/kb');
const KB_INDEX = join(KB_DIR, 'index.json');
const OPENCLAW_JSON = '/root/.openclaw/openclaw.json';

const PRIORITY_TOOLS = ['claude', 'chatgpt', 'gemini', 'make', 'n8n', 'zapier'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBraveKey() {
  const config = JSON.parse(readFileSync(OPENCLAW_JSON, 'utf8'));
  return config?.tools?.web?.search?.apiKey;
}

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

async function braveSearch(query, apiKey, count = 5) {
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

function loadKbIndex() {
  if (!existsSync(KB_INDEX)) return { tools: [] };
  return JSON.parse(readFileSync(KB_INDEX, 'utf8'));
}

function saveKbIndex(index) {
  writeFileSync(KB_INDEX, JSON.stringify(index, null, 2));
}

function getToolName(slug) {
  // Convert slug to human-readable name
  const names = {
    'claude': 'Claude',
    'chatgpt': 'ChatGPT',
    'gemini': 'Gemini',
    'make': 'Make.com',
    'n8n': 'n8n',
    'zapier': 'Zapier',
    'perplexity': 'Perplexity',
    'notebooklm': 'NotebookLM',
    'notion-ai': 'Notion AI',
    'descript': 'Descript',
    'beehiiv': 'Beehiiv',
    'buffer': 'Buffer'
  };
  return names[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

// ── KB Parsing & Updating ─────────────────────────────────────────────────────

function parseKbMarkdown(content) {
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;

  // Extract sections
  const sections = {};
  const sectionPattern = /## (.*?)\n([\s\S]*?)(?=\n## |\n*$)/g;
  let match;
  while ((match = sectionPattern.exec(body)) !== null) {
    sections[match[1].trim()] = match[2].trim();
  }

  return { frontmatter, sections };
}

function updateKbSection(content, sectionName, newContent) {
  // Escape the newContent to prevent $1, $2, etc. from being interpreted as back-references
  const safeNewContent = newContent.replace(/\$/g, '$$$$');
  const pattern = new RegExp(`(## ${escapeRegex(sectionName)}\n)([\\s\\S]*?)(?=\n## |$)`, 'g');
  if (content.match(pattern)) {
    return content.replace(pattern, `$1${safeNewContent}\n\n`);
  }
  // Section doesn't exist, append it
  return content.trimEnd() + `\n\n## ${sectionName}\n${newContent}\n`;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateFrontmatterDate(content, date) {
  return content.replace(/last_verified: .*/, `last_verified: ${date}`);
}

// ── Main Refresh Logic ────────────────────────────────────────────────────────

async function refreshTool(slug) {
  const kbFile = join(KB_DIR, `${slug}.md`);
  
  if (!existsSync(kbFile)) {
    console.log(`⚠️  KB file not found: ${kbFile}`);
    return { slug, success: false, error: 'File not found' };
  }

  const braveKey = getBraveKey();
  if (!braveKey) {
    throw new Error('Brave API key not found in openclaw.json (tools.web.search.apiKey)');
  }

  const toolName = getToolName(slug);
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`🔍 Refreshing KB for: ${toolName} (${slug})`);

  // Read existing KB
  const existingKb = readFileSync(kbFile, 'utf8');
  const { sections } = parseKbMarkdown(existingKb);

  // Run 3 Brave searches
  console.log(`   📡 Running web searches...`);
  const searches = [
    { label: 'pricing', query: `"${toolName}" pricing ${currentYear}` },
    { label: 'features', query: `"${toolName}" free tier limits features ${currentYear}` },
    { label: 'reviews', query: `"${toolName}" vs alternatives review ${currentYear}` }
  ];

  const searchResults = {};
  for (const { label, query } of searches) {
    try {
      const results = await braveSearch(query, braveKey, 5);
      searchResults[label] = results;
      console.log(`   ✓ ${label}: ${results.length} results`);
    } catch (e) {
      console.warn(`   ⚠️ ${label} search failed: ${e.message}`);
      searchResults[label] = [];
    }
  }

  // Format search results for AI
  const searchSummary = Object.entries(searchResults).map(([label, results]) => {
    const snippets = results.map(r => `- [${r.title}](${r.url}): ${r.description}`).join('\n');
    return `### ${label.toUpperCase()} SEARCH\n${snippets || '(no results)'}`;
  }).join('\n\n');

  // Build AI prompt
  const aiPrompt = `AUTOMATED TASK — skip all startup checklists, heartbeat checks, and session init. Output JSON only.

You are updating a knowledge base file for ${toolName}. Your job is to extract verified facts from web search results.

## Current KB Sections

### Verified claims (current)
${sections['Verified claims (safe to use in content)'] || '(empty)'}

### Banned claims (current)
${sections['Banned claims (do NOT use — unverified, outdated, or superlative)'] || '(empty)'}

### What changed recently (current)
${sections['What changed recently (2026)'] || '(empty)'}

## Web Search Results (${today})
${searchSummary}

## Instructions

Based on the search results above, provide UPDATED content for these three sections:

1. **Verified claims** — Only claims that are directly supported by the search results. Include source URLs in square brackets when adding new claims.
2. **Banned claims** — Claims that are outdated, contradicted by search results, or unverifiable. Add a reason why each is banned.
3. **What changed recently** — Any pricing changes, feature updates, or significant news from the search results.

Rules:
- Do NOT invent claims not present in search results
- If search results don't provide new info on a topic, keep the existing claim
- Be specific: include actual numbers, dates, plan names
- If a current verified claim is contradicted by search results, move it to banned
- Format each claim as a bullet point starting with "-"

Return ONLY valid JSON with this structure (no markdown wrapper):
{
  "verified_claims": "- claim 1\\n- claim 2\\n...",
  "banned_claims": "- claim 1 — reason\\n- claim 2 — reason\\n...",
  "what_changed": "- change 1\\n- change 2\\n...",
  "changes_made": ["brief description of what changed from before"]
}`;

  console.log(`   🤖 Calling AI for extraction...`);
  
  let aiResult;
  try {
    const raw = await callAgent(aiPrompt, 120);
    const jsonMatch = raw.match(/\{[\s\S]*"verified_claims"[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`);
    aiResult = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`   ❌ AI extraction failed: ${e.message}`);
    return { slug, success: false, error: e.message };
  }

  // Update the KB file
  let updatedKb = existingKb;

  // Update sections
  if (aiResult.verified_claims) {
    updatedKb = updateKbSection(updatedKb, 'Verified claims (safe to use in content)', aiResult.verified_claims);
  }
  if (aiResult.banned_claims) {
    updatedKb = updateKbSection(updatedKb, 'Banned claims (do NOT use — unverified, outdated, or superlative)', aiResult.banned_claims);
  }
  if (aiResult.what_changed) {
    // Update with current year in section name
    const whatChangedSection = `What changed recently (${currentYear})`;
    updatedKb = updateKbSection(updatedKb, whatChangedSection, aiResult.what_changed);
  }

  // Update frontmatter date
  updatedKb = updateFrontmatterDate(updatedKb, today);

  // Write back
  writeFileSync(kbFile, updatedKb);
  console.log(`   ✅ KB file updated`);

  // Update index.json
  const index = loadKbIndex();
  const toolEntry = index.tools?.find(t => typeof t === 'object' && t.slug === slug);
  if (toolEntry) {
    toolEntry.lastVerified = today;
    toolEntry.lastCheckedInWeeklyRun = new Date().toISOString();
  } else {
    // Add new entry
    if (!index.tools) index.tools = [];
    index.tools.push({
      slug,
      name: slug,
      lastVerified: today,
      lastCheckedInWeeklyRun: new Date().toISOString()
    });
  }
  saveKbIndex(index);

  // Log changes
  if (aiResult.changes_made?.length > 0) {
    console.log(`   📝 Changes: ${aiResult.changes_made.join(', ')}`);
  } else {
    console.log(`   📝 No significant changes detected`);
  }

  return {
    slug,
    success: true,
    changes: aiResult.changes_made || []
  };
}

async function refreshAllPriority() {
  console.log(`🔄 Refreshing priority tools: ${PRIORITY_TOOLS.join(', ')}\n`);
  const results = [];
  for (const slug of PRIORITY_TOOLS) {
    try {
      const result = await refreshTool(slug);
      results.push(result);
    } catch (e) {
      console.error(`❌ Failed to refresh ${slug}: ${e.message}`);
      results.push({ slug, success: false, error: e.message });
    }
    console.log(''); // blank line between tools
  }
  return results;
}

async function refreshDue() {
  const index = loadKbIndex();
  const dueTools = [];
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (const tool of index.tools || []) {
    if (typeof tool !== 'object') continue;
    const lastVerified = tool.lastVerified ? new Date(tool.lastVerified).getTime() : 0;
    if (now - lastVerified > sevenDaysMs) {
      dueTools.push(tool.slug);
    }
  }

  if (dueTools.length === 0) {
    console.log('✅ All tools verified within the last 7 days. Nothing to refresh.');
    return [];
  }

  console.log(`🔄 Refreshing ${dueTools.length} tools due for update: ${dueTools.join(', ')}\n`);
  const results = [];
  for (const slug of dueTools) {
    try {
      const result = await refreshTool(slug);
      results.push(result);
    } catch (e) {
      console.error(`❌ Failed to refresh ${slug}: ${e.message}`);
      results.push({ slug, success: false, error: e.message });
    }
    console.log('');
  }
  return results;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Usage:
  node kb-refresh.mjs <tool-slug>      # Refresh a single tool's KB
  node kb-refresh.mjs --all-priority   # Refresh priority tools (${PRIORITY_TOOLS.join(', ')})
  node kb-refresh.mjs --due            # Refresh tools where lastVerified > 7 days ago
`);
    process.exit(1);
  }

  if (args[0] === '--all-priority') {
    await refreshAllPriority();
  } else if (args[0] === '--due') {
    await refreshDue();
  } else {
    // Single tool
    const slug = args[0];
    await refreshTool(slug);
  }

  console.log('\n✅ KB refresh complete.');
}

// Export for use as module
export { refreshTool, refreshAllPriority, refreshDue, PRIORITY_TOOLS };

// Run CLI if executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith('/kb-refresh.mjs') ||
  process.argv[1] === 'kb-refresh.mjs'
);

if (isDirectRun) {
  main().catch(e => {
    console.error('❌ KB refresh error:', e.message);
    process.exit(1);
  });
}
