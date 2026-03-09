#!/usr/bin/env node
/**
 * monitor-20m-milestone.mjs
 *
 * Polls blockchain.info for total BTC supply.
 * Once 20,000,000 BTC are mined, posts the milestone thread (dashboard ID 186),
 * updates the dashboard, notifies Lennart via Telegram, and removes itself.
 *
 * Scheduled via openclaw cron to run every 20 minutes from ~14:00 UTC onwards.
 * Flag file prevents double-posting if cron fires multiple times after threshold.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FLAG_FILE    = '/tmp/20m-milestone-posted';
const DASHBOARD_ID = 186;
const TARGET_SATS  = 2_000_000_000_000_000n; // 20,000,000 BTC in satoshis
const THREAD_TMP   = '/tmp/20m-milestone-thread.json';

// --- Guard: don't double-post ---
if (fs.existsSync(FLAG_FILE)) {
  console.log('Flag file exists — already posted. Exiting.');
  process.exit(0);
}

// --- Check current supply ---
let satoshis;
try {
  const res  = await fetch('https://blockchain.info/q/totalbc');
  const text = (await res.text()).trim();
  satoshis   = BigInt(text);
} catch (e) {
  console.error('Failed to fetch supply:', e.message);
  process.exit(1);
}

const btcMined   = Number(satoshis) / 1e8;
const remaining  = Number(TARGET_SATS - (satoshis < TARGET_SATS ? satoshis : TARGET_SATS)) / 1e8;
const minutesEta = Math.ceil(remaining / 3.125 * 10);

console.log(`Current supply: ${btcMined.toFixed(2)} BTC`);

if (satoshis < TARGET_SATS) {
  console.log(`Not yet. ${remaining.toFixed(2)} BTC remaining (~${minutesEta} min)`);
  process.exit(0);
}

// --- Milestone crossed! ---
console.log('🎉 20,000,000 BTC mined! Posting thread...');

// Write flag immediately to prevent race conditions
fs.writeFileSync(FLAG_FILE, new Date().toISOString());

// --- Fetch thread from dashboard ---
let tweets;
try {
  const res  = await fetch(`http://localhost:3000/api/content-pipeline/${DASHBOARD_ID}`);
  const data = await res.json();
  tweets     = data.item.content_json.tweets
    .sort((a, b) => a.order - b.order)
    .map(t => t.text);
} catch (e) {
  console.error('Failed to fetch dashboard item:', e.message);
  process.exit(1);
}

// --- Write temp thread file ---
fs.writeFileSync(THREAD_TMP, JSON.stringify({ tweets }, null, 2));

// --- Post the thread ---
let firstTweetId = null;
try {
  const { stdout } = await execFileAsync('node', [
    path.join(__dirname, 'post-thread.mjs'),
    THREAD_TMP,
  ], { timeout: 120_000 });

  console.log(stdout);

  // Extract first tweet ID from output
  const match = stdout.match(/btcmaxistheway\/status\/(\d+)/);
  if (match) firstTweetId = match[1];
} catch (e) {
  console.error('Posting failed:', e.message);
  fs.unlinkSync(FLAG_FILE); // allow retry on next cron
  process.exit(1);
}

// --- Update dashboard status ---
try {
  await fetch(`http://localhost:3000/api/content-pipeline/${DASHBOARD_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status:          'posted',
      posted_at:       new Date().toISOString(),
      posted_tweet_id: firstTweetId,
    }),
  });
  console.log('Dashboard updated to posted.');
} catch (e) {
  console.warn('Dashboard update failed (non-fatal):', e.message);
}

// --- Notify Lennart ---
try {
  const cfg      = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
  const botToken = cfg.channels?.telegram?.botToken;
  const threadUrl = firstTweetId
    ? `https://x.com/btcmaxistheway/status/${firstTweetId}`
    : '(check @btcmaxistheway)';

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    '2046511634',
      text:       `🎉 *20M BTC milestone thread posted!*\n\nThe 20 millionth Bitcoin was just mined. Thread is live:\n${threadUrl}`,
      parse_mode: 'Markdown',
    }),
  });
  console.log('Lennart notified.');
} catch (e) {
  console.warn('Telegram notify failed (non-fatal):', e.message);
}

// Cleanup temp file
try { fs.unlinkSync(THREAD_TMP); } catch {}

console.log('\n✅ Done.');
