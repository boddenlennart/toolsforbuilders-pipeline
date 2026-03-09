#!/usr/bin/env node
/**
 * morning-intelligence.mjs — Content pipeline trigger
 *
 * Fetches home timeline, saves to file, scores and filters tweets, then sends a message to the
 * OpenClaw main agent session which does the actual draft generation
 * using its existing Claude session — no extra API cost.
 *
 * Usage: node morning-intelligence.mjs
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=== Morning Intelligence — Step 1: Fetch Timeline ===\n');

// Step 1: fetch and save timeline
try {
  const { stdout, stderr } = await execFileAsync('node', [
    path.join(__dirname, 'save-timeline.mjs')
  ], { timeout: 60000 });
  console.log(stdout);
  if (stderr) console.error(stderr);
} catch (e) {
  if (e.message && e.message.includes('CreditsDepleted')) {
    console.warn('⚠️  Twitter API credits depleted — falling back to cached timeline.');
    const cached = '/root/.openclaw/workspace/memory/timeline-latest.json';
    if (!fs.existsSync(cached)) {
      console.error('No cached timeline available. Aborting scan.');
      process.exit(1);
    }
    const age = (Date.now() - fs.statSync(cached).mtimeMs) / 3600000;
    console.log(`Using cached timeline (${age.toFixed(1)}h old)`);
  } else {
    console.error('Timeline fetch failed:', e.message);
    process.exit(1);
  }
}

// Step 1.5: load tier map from target-accounts.md
function loadTierMap(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const tier3 = [], tier2 = [], tier1 = [];
  let currentTier = null;
  for (const line of content.split('\n')) {
    if (line.includes('Tier 3') || line.includes('tier 3')) currentTier = 3;
    else if (line.includes('Tier 2') || line.includes('tier 2')) currentTier = 2;
    else if (line.includes('Tier 1') || line.includes('tier 1')) currentTier = 1;
    const handle = line.match(/@(\w+)/)?.[1]?.toLowerCase();
    if (handle) {
      if (currentTier === 3) tier3.push(handle);
      else if (currentTier === 2) tier2.push(handle);
      else if (currentTier === 1) tier1.push(handle);
    }
  }
  return { tier1, tier2, tier3 };
}

const tierMap = loadTierMap(path.join(__dirname, 'target-accounts.md'));
console.log(`Loaded tier map: Tier 3=${tierMap.tier3.length}, Tier 2=${tierMap.tier2.length}, Tier 1=${tierMap.tier1.length}`);

// Step 1.6: score and filter tweets
function scoreTweet(tweet, tierMap) {
  let score = 0;
  // author is a plain string username (e.g. "NickSzabo4"), not an object
  const author = tweet.author?.toLowerCase();
  
  // Tier bonus (biggest signal)
  if (tierMap.tier3.includes(author)) score += 100;
  else if (tierMap.tier2.includes(author)) score += 30;
  else if (tierMap.tier1.includes(author)) score += -999; // exclude
  
  // Engagement signals — fields from normaliseTweet: likes, replies, retweets
  score += Math.min(tweet.likes || 0, 50) * 2;
  score += Math.min(tweet.replies || 0, 20) * 5;
  score += Math.min(tweet.retweets || 0, 30) * 3;
  
  // Recency bonus — field is createdAt (camelCase), not created_at
  const ageHours = (Date.now() - new Date(tweet.createdAt).getTime()) / 3600000;
  if (!isNaN(ageHours)) {
    if (ageHours < 4) score += 20;
    else if (ageHours > 20) score -= 30; // too stale
  }
  
  // Topic relevance (Bitcoin/sovereignty keywords)
  const text = tweet.text?.toLowerCase() || '';
  const bitcoinKeywords = ['bitcoin', 'btc', 'sats', 'sovereignty', 'custody', 'seed phrase', 'self-custody', 'lightning', 'hodl', 'fiat', 'inflation', 'central bank', 'cypherpunk'];
  const keywordMatches = bitcoinKeywords.filter(k => text.includes(k)).length;
  score += keywordMatches * 15;
  
  // Exclusions
  const excluded = ['excellion', 'petermccormack'];
  if (excluded.includes(author)) score = -9999;
  
  return score;
}

console.log('\n=== Scoring and filtering tweets ===');

const timelinePath = '/root/.openclaw/workspace/memory/timeline-latest.json';
const rawData = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
// Score targetTweets (full fields) + generalFeed (partial fields, but catches any Tier 3 not yet in targets)
const tweets = [...(rawData.targetTweets || []), ...(rawData.generalFeed || [])];
console.log(`Scoring ${tweets.length} tweets (${rawData.targetTweets?.length || 0} target + ${rawData.generalFeed?.length || 0} general feed)`);

const scored = tweets.map(tweet => ({
  ...tweet,
  score: scoreTweet(tweet, tierMap)
}));

const filtered = scored.filter(t => t.score > 30);
filtered.sort((a, b) => b.score - a.score);
const top = filtered.slice(0, 25);

const highRelevance = filtered.filter(t => t.score > 150);
const tier3Count = filtered.filter(t => tierMap.tier3.includes(t.author?.toLowerCase())).length;
const tier2Count = filtered.filter(t => tierMap.tier2.includes(t.author?.toLowerCase())).length;
const topOpportunity = top.length > 0 ? `${top[0].author} (score: ${top[0].score}) — "${top[0].text?.substring(0, 40)}..."` : 'none';

console.log(`📊 Timeline scored: ${tweets.length} raw → ${filtered.length} passed filter (score >30)`);
console.log(`   Tier 3 accounts: ${tier3Count} tweets`);
console.log(`   Tier 2 accounts: ${tier2Count} tweets`);
console.log(`   High relevance (score >150): ${highRelevance.length} tweets`);
console.log(`   Top opportunity: ${topOpportunity}`);

const scoredPath = '/root/.openclaw/workspace/memory/timeline-scored.json';
fs.writeFileSync(scoredPath, JSON.stringify({
  scoredAt: new Date().toISOString(),
  scoredAtBKK: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }),
  rawCount: tweets.length,
  filteredCount: filtered.length,
  topCount: top.length,
  tweets: top
}, null, 2));
console.log(`✅ Saved scored/filtered tweets to ${scoredPath}`);

// Step 2: send to main agent session for draft generation
console.log('\n=== Step 2: Sending to agent for draft generation ===\n');

// Compute Bangkok date at runtime so the agent uses the exact correct date
const bkkDate = new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Bangkok', dateStyle: 'short' }).format(new Date());
console.log(`Bangkok date: ${bkkDate}`);

const message = `CONTENT PIPELINE SCAN. Bangkok date: ${bkkDate}

Scored opportunities at: /root/.openclaw/workspace/memory/timeline-scored.json (pre-filtered, ranked by score — focus on score > 100 first)
Rules at: /root/.openclaw/workspace/memory/content-pipeline-rules.md
Writing rules: /root/.openclaw/workspace/memory/writing-rules.md

Today's pipeline: GET http://localhost:3000/api/content-pipeline?date_from=${bkkDate}&date_to=${bkkDate}

Run stale cleanup, check caps, draft content per rules. Post to dashboard API. Focus on Tier 3 accounts first.`;

console.log('Agent prompt length:', message.length, 'chars');
console.log('Sending to agent...');

let agentTriggered = false;

try {
  const { stdout } = await execFileAsync('openclaw', [
    'agent', '--local', '--agent', 'main',
    '--message', message,
  ], { timeout: 300000, maxBuffer: 1024 * 1024 });

  console.log('Agent response received.');
  const lines = stdout.split('\n').filter(l => l.includes('draft') || l.includes('submitted') || l.includes('Complete'));
  if (lines.length) console.log(lines.join('\n'));
  agentTriggered = true;

} catch (e) {
  const isLocked = e.message && (e.message.includes('locked') || e.message.includes('lock'));
  if (isLocked) {
    // Main session is active (e.g. Telegram conversation in progress).
    // Fall back: send via Telegram bot → agent picks it up as a normal message.
    console.warn('⚠️  Session locked — main agent is in an active conversation.');
    console.warn('    Falling back to Telegram channel trigger...');
    try {
      const cfg = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
      const botToken = cfg.channels?.telegram?.botToken;
      const chatId   = '2046511634';
      if (!botToken) throw new Error('No Telegram bot token in openclaw.json');
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
      if (!r.ok) throw new Error(`Telegram API ${r.status}: ${await r.text()}`);
      console.log('✅ Fallback: pipeline message sent via Telegram. Agent will process it on next activity.');
      agentTriggered = true;
    } catch (tgErr) {
      console.error('Telegram fallback also failed:', tgErr.message);
      // Log to file so the cron shows the failure without exiting non-zero
      fs.appendFileSync('/root/.openclaw/workspace/memory/scan-errors.log',
        `${new Date().toISOString()} agent_trigger_failed: ${e.message} | telegram_fallback: ${tgErr.message}\n`);
    }
  } else {
    console.error('Agent trigger failed:', e.message);
    fs.appendFileSync('/root/.openclaw/workspace/memory/scan-errors.log',
      `${new Date().toISOString()} agent_trigger_failed: ${e.message}\n`);
    process.exit(1);
  }
}

// Notify Lennart via Telegram
try {
  const { readFileSync } = await import('fs');
  const cfg = JSON.parse(readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
  const botToken = cfg.channels?.telegram?.botToken;
  // DM Lennart directly (not group) so it's a clear ping
  const chatId = '2046511634';
  if (botToken) {
    // Count new drafts added this run
    const countRes = await fetch('http://localhost:3000/api/content-pipeline?status=draft');
    const countData = await countRes.json();
    const draftCount = countData.items?.length || 0;
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📋 *Scan complete* (${now} BKK)\n\n${draftCount} draft${draftCount !== 1 ? 's' : ''} ready in the pipeline. Tap to review: http://100.105.60.33:3000`,
        parse_mode: 'Markdown',
      }),
    });
  }
} catch (e) {
  console.error('Telegram ping failed:', e.message);
}

console.log('\n✅ Done. Check dashboard for new drafts.');