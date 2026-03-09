#!/usr/bin/env node
/**
 * save-timeline.mjs — Fetch home timeline and save to file for agent processing
 *
 * Cost-optimised strategy:
 *   1. Read cursor.json for the last-seen tweet ID
 *   2. Pass since_id to X API → only new tweets are returned (and charged)
 *   3. Merge new tweets with the existing cached set (dedup by ID)
 *   4. Trim merged set to hoursBack window (client-side, free)
 *   5. Write merged set + update cursor
 *
 * Net result: first fetch of the day ≈ 30-80 tweet reads; subsequent fetches ≈ 5-30.
 * Without this, every fetch cost 200 reads regardless of overlap.
 *
 * Usage: node save-timeline.mjs
 */

import { fetchTimeline } from './fetch-timeline.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH    = path.join(__dirname, '../../memory/timeline-latest.json');
const CURSOR_PATH = path.join(__dirname, '../../memory/timeline-cursor.json');
const HOURS_BACK  = 14;

// ── helpers ──────────────────────────────────────────────────────────────────

function parseTargetAccounts() {
  const content = fs.readFileSync(path.join(__dirname, 'target-accounts.md'), 'utf-8');
  const tier1 = [], tier2 = [], tier3 = [];
  const t1 = content.match(/## Tier 1[^\n]*\n[\s\S]*?(?=\n## )/);
  if (t1) tier1.push(...[...t1[0].matchAll(/\| @(\w+) \|/g)].map(m => m[1]));
  const t2 = content.match(/## Tier 2[^\n]*\n[\s\S]*?(?=\n## )/);
  if (t2) tier2.push(...[...t2[0].matchAll(/\| @(\w+) \|/g)].map(m => m[1]));
  // Tier 3 = PRIMARY reply targets — must be in targetTweets, not generalFeed
  const t3 = content.match(/## Tier 3[^\n]*\n[\s\S]*?(?=\n## |$)/);
  if (t3) tier3.push(...[...t3[0].matchAll(/\| @(\w+) \|/g)].map(m => m[1]));
  return { tier1, tier2, tier3 };
}

function todayBKK() {
  return new Date().toLocaleDateString('sv', { timeZone: 'Asia/Bangkok' });
}

function normaliseTweet(t) {
  return {
    id:        t.id,
    url:       t.url,
    author:    t.author,
    followers: t.followers,
    text:      t.text,
    likes:     t.likes,
    retweets:  t.retweets,
    replies:   t.replies,
    score:     Math.round(t.score || 0),
    tier:      t.tier || 0,
    createdAt: t.createdAt,
  };
}

// ── cursor: read last-seen tweet ID ──────────────────────────────────────────

let sinceId = null;
let cursorAgeH = null;

if (fs.existsSync(CURSOR_PATH)) {
  try {
    const cursor = JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8'));
    sinceId    = cursor.lastId   || null;
    cursorAgeH = cursor.fetchedAt
      ? ((Date.now() - new Date(cursor.fetchedAt).getTime()) / 3_600_000).toFixed(1)
      : null;
    console.log(`📌 Using since_id cursor: ${sinceId} (${cursorAgeH}h old) — X API will only return newer tweets`);
  } catch {
    console.warn('⚠️  Could not read cursor file, falling back to full fetch');
  }
} else {
  console.log('No cursor found — first fetch, will get full 14h window');
}

// ── fetch new tweets ──────────────────────────────────────────────────────────

console.log('Fetching home timeline…');
const newTweets = await fetchTimeline({
  hoursBack:        HOURS_BACK,
  maxTweets:        100,          // 1 page = 100 reads max (down from 200)
  excludeRetweets:  true,
  sinceId,                        // X API returns only tweets newer than this
});
console.log(`Fetched ${newTweets.length} new tweet(s) from API`);

// ── load existing cache & merge ───────────────────────────────────────────────

let cachedTweets = [];
if (sinceId && fs.existsSync(OUT_PATH)) {
  try {
    const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    cachedTweets = existing.targetTweets || [];
    console.log(`Loaded ${cachedTweets.length} tweets from cache`);
  } catch {
    console.warn('⚠️  Could not read cache, starting fresh');
  }
}

// Merge new + cached, deduplicate by id, filter to HOURS_BACK window
const cutoff  = new Date(Date.now() - HOURS_BACK * 3_600_000);
const seenIds = new Set();
const merged  = [...newTweets.map(normaliseTweet), ...cachedTweets]
  .filter(t => {
    if (seenIds.has(t.id)) return false;
    if (new Date(t.createdAt) < cutoff) return false;
    seenIds.add(t.id);
    return true;
  })
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

console.log(`Merged set: ${merged.length} unique tweets within ${HOURS_BACK}h window`);

// ── separate target vs general ────────────────────────────────────────────────

const { tier1, tier2, tier3 } = parseTargetAccounts();
const allTargets = new Set([...tier1, ...tier2, ...tier3].map(a => a.toLowerCase()));
console.log(`Target accounts: ${tier1.length} Tier 1, ${tier2.length} Tier 2, ${tier3.length} Tier 3`);

const targetTweets = merged.filter(t =>  allTargets.has(t.author.toLowerCase()));
const generalFeed  = merged.filter(t => !allTargets.has(t.author.toLowerCase())).slice(0, 20);

// ── write output ──────────────────────────────────────────────────────────────

const output = {
  fetchedAt:    new Date().toISOString(),
  fetchedAtBKK: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }),
  today:        todayBKK(),
  sinceIdUsed:  sinceId,
  newTweetsFetched: newTweets.length,
  totalCached:  merged.length,
  targetTweets,
  generalFeed:  generalFeed.map(t => ({
    id:        t.id,
    url:       t.url,
    author:    t.author,
    text:      t.text.slice(0, 150),
    likes:     t.likes,
    retweets:  t.retweets,
    replies:   t.replies,
    createdAt: t.createdAt,
  })),
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

// ── update cursor (newest tweet ID by date) ───────────────────────────────────

if (newTweets.length > 0) {
  // Sort by ID descending — tweet IDs are snowflake IDs (time-ordered), highest = newest
  const newestId = newTweets
    .map(t => BigInt(t.id))
    .reduce((a, b) => (a > b ? a : b))
    .toString();

  fs.writeFileSync(CURSOR_PATH, JSON.stringify({
    lastId:    newestId,
    fetchedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`💾 Cursor updated → ${newestId}`);
} else {
  console.log('No new tweets — cursor unchanged');
}

console.log(`\n✅ Saved to ${OUT_PATH}`);
console.log(`   ${targetTweets.length} target account tweets`);
console.log(`   ${generalFeed.length} general feed tweets`);
console.log(`   API reads this call: ${newTweets.length} (was always 200 before)`);
if (newTweets.length > 0) {
  console.log(`   Top targets: ${targetTweets.slice(0,3).map(t=>`@${t.author}(${t.score})`).join(', ')}`);
}
console.log('\nReady for agent processing.');
