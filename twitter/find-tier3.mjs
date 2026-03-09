#!/usr/bin/env node
// find-tier3.mjs — Discover Tier 3 candidates (3K-50K followers) via follower graph mining
// Strategy: pull following lists from seed Tier 3 accounts, filter by follower count,
// cross-reference against existing tracked accounts, surface new candidates.

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';

// --- Seed accounts (existing Tier 3 — well-curated, on-topic) ---
// We pull THEIR following lists to find similar accounts
const SEED_ACCOUNTS = [
  { username: 'TomerStrolight', id: '738149484946538496' },
  { username: 'BitcoinSapiens', id: '1111111111111111111' }, // placeholder — resolve below
  { username: 'Cole_Walmsley', id: '111111111' },            // placeholder
  { username: 'BitPaine', id: '111111111' },                  // placeholder
  { username: 'stack2thefuture', id: '111111111' },           // placeholder
];

const FOLLOWER_MIN = 3000;
const FOLLOWER_MAX = 50000;
const MAX_RESULTS_PER_SEED = 100; // pull 100 following per seed account

// Existing accounts we already track (skip these in output)
const ALREADY_TRACKED = new Set([
  'saylor','naval','100trillionUSD','APompliano','willywoo','danheld','LynAldenContact',
  'maxkeiser','PeterMcCormack','jackmallers','nic_carter','Breedlove22','saifedean',
  'JeffBooth','NickSzabo4','Excellion','jimmysong','CorySwan','CaitlinLong_',
  'LawrenceLepard','Dennis_Porter_','theionicXBT','pete_rizzo_','stephanlivera',
  'jameslavish','real_vijay','hodlonaut','JoshMandell6','SimplyBitcoin','CarlBMenger',
  'crossbordercap','BTC_for_Freedom','stackhodler','BitcoinPierre','BritishHodl',
  'Croesus_BTC','blocktrainer','Matt_Hougan','gerovich','AdamBLiv','BITVOLT',
  'BitcoinSapiens','TomerStrolight','Metaplanet','RobynHD','RomanReher','AaronvanW',
  'PunterJeff','BitPaine','alanbwt','AlanWolan','bramk','bitcoinmunger','NikoJilch',
  'sunny051488','bitcoin_hotel','Handrev','Cole_Walmsley','bruceflorian','RoaringRagnar',
  'OnrampBitcoin','adamobrien','leonwankum','Dante_Cook1','stack2thefuture',
  'btcmaxistheway',
]);

function loadSecrets(f) {
  const r = {};
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    r[t.slice(0, i)] = t.slice(i + 1);
  }
  return r;
}

function encode(s) {
  return encodeURIComponent(String(s)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, baseUrl, qp, ck, cs, tk, ts) {
  const op = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tk,
    oauth_version: '1.0',
  };
  const all = { ...op, ...qp };
  const sorted = Object.entries(all).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
  const base = [method.toUpperCase(), encode(baseUrl), encode(sorted)].join('&');
  const key = `${encode(cs)}&${encode(ts)}`;
  op.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(op).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}="${encode(v)}"`).join(', ');
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const p = new URL(url);
    const req = https.request({ hostname: p.hostname, path: p.pathname + p.search, method: 'GET', headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = env;

// Step 1: Resolve user IDs for seed accounts (lookup by username)
async function resolveUserId(username) {
  const baseUrl = `https://api.x.com/2/users/by/username/${username}`;
  const qp = { 'user.fields': 'public_metrics' };
  const auth = oauthSign('GET', baseUrl, qp, ck, cs, tk, ts);
  const qs = Object.entries(qp).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const r = await httpsGet(`${baseUrl}?${qs}`, { Authorization: auth });
  if (r.status === 200 && r.body.data) return r.body.data.id;
  return null;
}

// Step 2: Pull following list for a user ID
async function getFollowing(userId, username) {
  const baseUrl = `https://api.x.com/2/users/${userId}/following`;
  const qp = {
    max_results: String(MAX_RESULTS_PER_SEED),
    'user.fields': 'public_metrics,username,name,description',
  };
  const auth = oauthSign('GET', baseUrl, qp, ck, cs, tk, ts);
  const qs = Object.entries(qp).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const r = await httpsGet(`${baseUrl}?${qs}`, { Authorization: auth });
  if (r.status !== 200) {
    console.error(`  ❌ Failed for @${username}: ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    return [];
  }
  return r.body.data || [];
}

console.log('🔍 Tier 3 Account Discovery — Follower Graph Mining\n');
console.log(`Filter: ${FOLLOWER_MIN.toLocaleString()}–${FOLLOWER_MAX.toLocaleString()} followers | Bitcoin-relevant\n`);
console.log('='.repeat(70));

// Resolve IDs for seeds that have placeholder IDs
const resolvedSeeds = [];
for (const seed of SEED_ACCOUNTS) {
  process.stdout.write(`Resolving @${seed.username}... `);
  const id = await resolveUserId(seed.username);
  if (id) {
    resolvedSeeds.push({ ...seed, id });
    console.log(`✅ ${id}`);
  } else {
    console.log(`❌ skipped`);
  }
  await sleep(500);
}

// Pull following lists and collect candidates
const candidateMap = new Map(); // username -> { ...user, appearsIn: [seed1, seed2...] }

for (const seed of resolvedSeeds) {
  console.log(`\n📋 Pulling following list from @${seed.username}...`);
  const following = await getFollowing(seed.id, seed.username);
  console.log(`   Got ${following.length} accounts`);

  for (const user of following) {
    const fc = user.public_metrics?.followers_count || 0;
    if (fc < FOLLOWER_MIN || fc > FOLLOWER_MAX) continue;
    if (ALREADY_TRACKED.has(user.username)) continue;

    if (candidateMap.has(user.username)) {
      candidateMap.get(user.username).appearsIn.push(seed.username);
    } else {
      candidateMap.set(user.username, {
        username: user.username,
        name: user.name,
        followers: fc,
        description: (user.description || '').slice(0, 100),
        appearsIn: [seed.username],
      });
    }
  }
  await sleep(1000); // rate limit buffer
}

// Sort by: appears in most seeds first, then by followers desc
const candidates = [...candidateMap.values()]
  .sort((a, b) => b.appearsIn.length - a.appearsIn.length || b.followers - a.followers);

console.log(`\n${'='.repeat(70)}`);
console.log(`\n✅ Found ${candidates.length} Tier 3 candidates not yet tracked\n`);

if (candidates.length === 0) {
  console.log('No new candidates found. Try expanding seed accounts.');
  process.exit(0);
}

// Display results
console.log('⭐ HIGH CONFIDENCE (followed by 2+ seed accounts):');
const highConf = candidates.filter(c => c.appearsIn.length >= 2);
const lowConf = candidates.filter(c => c.appearsIn.length === 1);

for (const c of highConf) {
  console.log(`\n@${c.username} — ${c.name} (${c.followers.toLocaleString()} followers)`);
  console.log(`   Followed by: ${c.appearsIn.map(s => '@' + s).join(', ')}`);
  console.log(`   Bio: ${c.description}`);
  console.log(`   https://x.com/${c.username}`);
}

if (lowConf.length > 0) {
  console.log(`\n📋 SINGLE SEED (${lowConf.length} accounts — review manually):`);
  for (const c of lowConf.slice(0, 20)) {
    console.log(`@${c.username} (${c.followers.toLocaleString()}) — via @${c.appearsIn[0]} — ${c.description.slice(0, 60)}`);
  }
  if (lowConf.length > 20) console.log(`... and ${lowConf.length - 20} more`);
}

// Save full results to file
const output = {
  runDate: new Date().toISOString(),
  seedAccounts: resolvedSeeds.map(s => s.username),
  totalCandidates: candidates.length,
  highConfidence: highConf,
  singleSeed: lowConf,
};
fs.writeFileSync('/root/.openclaw/workspace/memory/tier3-candidates.json', JSON.stringify(output, null, 2));
console.log(`\n💾 Full results saved to memory/tier3-candidates.json`);
