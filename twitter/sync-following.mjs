#!/usr/bin/env node
// sync-following.mjs — Daily check for new followed accounts
// Diffs current following list against snapshot, assesses relevance,
// and adds new relevant accounts to target-accounts.md

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '../../');
const SECRETS_FILE = path.join(WORKSPACE, '.env.secrets');
const SNAPSHOT_FILE = path.join(WORKSPACE, 'memory/twitter-following-snapshot.json');
const TARGET_ACCOUNTS_FILE = path.join(__dirname, 'target-accounts.md');

const USER_ID = '1821605462846140418';

// --- Load secrets ---
function loadSecrets() {
  const lines = fs.readFileSync(SECRETS_FILE, 'utf8').split('\n');
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return result;
}

// --- OAuth 1.0a signing ---
function buildAuthHeader(method, url, queryParams, secrets) {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = secrets;

  const oauthParams = {
    oauth_consumer_key: TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...queryParams };
  const sorted = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sorted)}`;
  const signingKey = `${encodeURIComponent(TWITTER_API_SECRET)}&${encodeURIComponent(TWITTER_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  oauthParams.oauth_signature = signature;

  return 'OAuth ' + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ');
}

// --- HTTP helper ---
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse failed: ${body.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// --- Fetch full following list ---
async function fetchFollowing(secrets) {
  const baseUrl = `https://api.twitter.com/2/users/${USER_ID}/following`;
  const queryParams = { max_results: '1000', 'user.fields': 'public_metrics,description,name' };
  const auth = buildAuthHeader('GET', baseUrl, queryParams, secrets);
  const url = baseUrl + '?' + new URLSearchParams(queryParams);
  const data = await httpGet(url, { Authorization: auth });

  if (data.errors || data.error) {
    throw new Error(`Twitter API error: ${JSON.stringify(data.errors || data.error)}`);
  }

  return (data.data || []).map(u => ({
    id: u.id,
    handle: u.username,
    name: u.name,
    followers: u.public_metrics?.followers_count || 0,
    description: u.description || '',
  }));
}

// --- Load snapshot ---
function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// --- Save snapshot ---
function saveSnapshot(accounts) {
  const snapshot = {};
  for (const a of accounts) {
    snapshot[a.id] = { handle: a.handle, name: a.name, followers: a.followers };
  }
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

// --- Assess relevance of new account ---
// Heuristic: check name/description for Bitcoin/sovereignty/philosophy signals
// Tier based on follower count
function assessAccount(account) {
  const text = `${account.name} ${account.description}`.toLowerCase();

  const bitcoinSignals = [
    'bitcoin', 'btc', '₿', 'satoshi', 'lightning', 'hodl', 'sovereignty',
    'self-custody', 'selfcustody', 'hard money', 'sound money', 'austrian',
    'hyperbitcoinization', 'fix the money', 'cryptography', 'cypherpunk',
    'monetary', 'store of value', 'defi', 'crypto', 'blockchain', 'nakamoto'
  ];

  const score = bitcoinSignals.filter(s => text.includes(s)).length;

  if (score === 0) return null; // Not relevant

  // Determine tier
  let tier;
  if (account.followers >= 400000) tier = 1;
  else if (account.followers >= 50000) tier = 2;
  else if (account.followers >= 10000) tier = 3;
  else return null; // Too small to be worth scanning

  return { tier, score };
}

// --- Check if handle already in target-accounts.md ---
function isAlreadyListed(handle) {
  if (!fs.existsSync(TARGET_ACCOUNTS_FILE)) return false;
  const content = fs.readFileSync(TARGET_ACCOUNTS_FILE, 'utf8');
  return content.toLowerCase().includes(`@${handle.toLowerCase()}`);
}

// --- Append new account to target-accounts.md ---
function addToTargetAccounts(account, tier, score) {
  const content = fs.readFileSync(TARGET_ACCOUNTS_FILE, 'utf8');
  const tierLabel = tier === 1 ? 'Tier 1' : tier === 2 ? 'Tier 2' : 'Tier 3';

  // Find the section header for this tier or the Accounts to Consider section
  const newEntry = `| @${account.handle} | ${account.name} | ${account.followers.toLocaleString()} | Auto-detected (score: ${score}). ${account.description.slice(0, 80)}${account.description.length > 80 ? '...' : ''} |`;

  // Append to "Accounts to Consider" section if it exists, otherwise add at end
  const considerSection = '## Accounts to Consider Following';
  if (content.includes(considerSection)) {
    // Find the end of the table in "Accounts to Consider"
    const idx = content.indexOf(considerSection);
    const afterSection = content.slice(idx);
    const tableEnd = afterSection.search(/\n## /);
    const insertAt = tableEnd === -1 ? content.length : idx + tableEnd;

    const updated = content.slice(0, insertAt) +
      `| @${account.handle} | ${account.name} (${tierLabel} candidate) | Auto-added ${new Date().toISOString().slice(0,10)} |\n` +
      content.slice(insertAt);
    fs.writeFileSync(TARGET_ACCOUNTS_FILE, updated);
  } else {
    // Append at end
    fs.appendFileSync(TARGET_ACCOUNTS_FILE, `\n| @${account.handle} | ${account.name} | ${tierLabel} candidate — auto-added ${new Date().toISOString().slice(0,10)} |\n`);
  }
}

// --- Main ---
async function main() {
  console.log('🔍 sync-following: checking for new followed accounts...');

  const secrets = loadSecrets();
  const snapshot = loadSnapshot();
  const current = await fetchFollowing(secrets);

  // Diff — find accounts not in snapshot
  const newAccounts = current.filter(a => !snapshot[a.id]);
  const unfollowed = Object.keys(snapshot).filter(id => !current.find(a => a.id === id));

  console.log(`📊 Following: ${current.length} total | ${newAccounts.length} new | ${unfollowed.length} unfollowed`);

  const added = [];
  const skipped = [];

  for (const account of newAccounts) {
    if (isAlreadyListed(account.handle)) {
      console.log(`  ⏭️  @${account.handle} — already in target list`);
      continue;
    }

    const assessment = assessAccount(account);
    if (!assessment) {
      console.log(`  ❌ @${account.handle} (${account.followers.toLocaleString()} followers) — not Bitcoin-relevant, skipped`);
      skipped.push(account.handle);
      continue;
    }

    console.log(`  ✅ @${account.handle} (${account.followers.toLocaleString()} followers) — Tier ${assessment.tier}, score ${assessment.score} → adding`);
    addToTargetAccounts(account, assessment.tier, assessment.score);
    added.push({ handle: account.handle, tier: assessment.tier, followers: account.followers });
  }

  // Update snapshot
  saveSnapshot(current);

  // Summary
  if (added.length > 0) {
    console.log(`\n✅ Added ${added.length} new account(s) to target-accounts.md:`);
    for (const a of added) {
      console.log(`   @${a.handle} → Tier ${a.tier} (${a.followers.toLocaleString()} followers)`);
    }

    // Write to daily memory log
    const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Bangkok' });
    const memoryFile = path.join(WORKSPACE, `memory/${today}.md`);
    const logEntry = `\n## Twitter Following Sync — ${new Date().toISOString()}\nAdded ${added.length} new account(s): ${added.map(a => `@${a.handle}`).join(', ')}\n`;
    fs.appendFileSync(memoryFile, logEntry);

    // Return non-zero to signal "something changed" for heartbeat/cron alerting
    process.stdout.write(`SYNC_RESULT:ADDED:${added.map(a => a.handle).join(',')}\n`);
  } else {
    console.log('\n✅ No new relevant accounts found.');
    process.stdout.write('SYNC_RESULT:NONE\n');
  }

  if (unfollowed.length > 0) {
    console.log(`ℹ️  Unfollowed ${unfollowed.length} account(s) — not auto-removing from target list (manual review)`);
  }
}

main().catch(err => {
  console.error('❌ sync-following failed:', err.message);
  process.exit(1);
});
