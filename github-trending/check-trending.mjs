#!/usr/bin/env node
/**
 * check-trending.mjs
 * Fetches GitHub Trending and writes scored results to a JSON file.
 * Does NOT send Telegram directly — the cron agent reads the output
 * and evaluates relevance with stack context before deciding what to send.
 *
 * Output: /tmp/github-trending-results.json
 * Run: node check-trending.mjs
 */

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '../../memory');
const LOG_FILE = join(MEMORY_DIR, 'github-trending-log.jsonl');
const OUTPUT_FILE = '/tmp/github-trending-results.json';

const PAGES = [
  { url: 'https://github.com/trending', label: 'all' },
  { url: 'https://github.com/trending/javascript', label: 'js' },
  { url: 'https://github.com/trending/typescript', label: 'ts' },
  { url: 'https://github.com/trending/python', label: 'py' },
  { url: 'https://github.com/trending/shell', label: 'sh' },
];

// Broad initial filter — cron agent does final relevance evaluation
const KEYWORDS = [
  // AI / LLM / agents
  'llm', 'language model', 'ai agent', 'openai', 'anthropic', 'claude', 'gpt',
  'embedding', 'rag', 'vector', 'mcp', 'model context protocol', 'ollama',
  'local ai', 'fine-tun', 'inference', 'agentic', 'multi-agent',
  'prompt', 'function call', 'tool use', 'skill',

  // Automation / workflow
  'automation', 'workflow', 'n8n', 'pipeline', 'scheduler', 'cron',
  'task queue', 'worker', 'job queue',

  // Our platforms
  'telegram', 'instagram', 'twitter', 'x api', 'webhook', 'bot',

  // Storage / data
  'sqlite', 'analytics', 'dashboard',

  // Node / JS ecosystem
  'bun', 'fastify', 'hono', 'elysia',

  // Self-hosting / infra
  'self-host', 'homelab', 'pwa', 'monitoring', 'observability',

  // Scraping
  'playwright', 'puppeteer', 'scraping', 'headless',

  // Dev tools
  'code generation', 'code assistant', 'developer tool', 'plugin',
];

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseRepos(html) {
  const repos = [];
  const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articlePattern.exec(html)) !== null) {
    const block = match[1];

    const pathMatch = block.match(/<h2[\s\S]*?href="\/([^"]+)"/);
    if (!pathMatch) continue;
    const repoPath = pathMatch[1].replace(/\s+/g, '').trim();
    if (!repoPath.match(/^[^/]+\/[^/]+$/) || repoPath.startsWith('sponsors')) continue;

    const descMatch = block.match(/class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '';

    const starsMatch = block.match(/([\d,]+)\s+stars? today/i);
    const starsToday = starsMatch ? parseInt(starsMatch[1].replace(/,/g, '')) : 0;

    const langMatch = block.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
    const language = langMatch ? langMatch[1].trim() : '';

    repos.push({ repoPath, description, starsToday, language });
  }

  return repos;
}

function scoreRepo(repo) {
  const haystack = `${repo.repoPath} ${repo.description}`.toLowerCase();
  const matched = KEYWORDS.filter(kw => haystack.includes(kw.toLowerCase()));
  return { ...repo, score: matched.length, matchedKeywords: matched };
}

function log(entry) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

async function main() {
  const now = new Date();
  const bkkDate = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok' });

  const seen = new Map();

  for (const page of PAGES) {
    try {
      const html = await fetchPage(page.url);
      const repos = parseRepos(html);
      for (const repo of repos) {
        const scored = scoreRepo(repo);
        const existing = seen.get(repo.repoPath);
        if (!existing || scored.score > existing.score) {
          seen.set(repo.repoPath, { ...scored, sourcePage: page.label });
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.error(`[github-trending] Failed to fetch ${page.url}: ${err.message}`);
    }
  }

  // Filter to score >= 1, sort by score desc then stars desc
  const candidates = [...seen.values()]
    .filter(r => r.score >= 1)
    .sort((a, b) => b.score - a.score || b.starsToday - a.starsToday)
    .slice(0, 15)
    .map(r => ({
      repo: r.repoPath,
      url: `https://github.com/${r.repoPath}`,
      description: r.description,
      starsToday: r.starsToday,
      language: r.language,
      score: r.score,
      matchedKeywords: r.matchedKeywords.slice(0, 5),
    }));

  const output = {
    date: bkkDate,
    ts: now.toISOString(),
    scanned: seen.size,
    candidates,
  };

  // Write results file for cron agent to evaluate
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[github-trending] Wrote ${candidates.length} candidates to ${OUTPUT_FILE}`);

  log({
    ts: now.toISOString(),
    date: bkkDate,
    scanned: seen.size,
    candidates: candidates.length,
  });
}

main().catch(err => {
  console.error('[github-trending] Fatal error:', err);
  process.exit(1);
});
