#!/usr/bin/env node
/**
 * sync-user-ids.mjs — One-time user ID sync for all tier accounts
 *
 * Cost: $0.010 × N users (e.g. 100 accounts = $1.00 one-time)
 * Benefit: eliminates User:Read charges on every future timeline fetch (~$0.40-0.50/day saved)
 *
 * Run once after topping up credits:
 *   node sync-user-ids.mjs
 *
 * Output: memory/user-id-map.json
 * Format: { users: { "author_id": { handle, tier, followers } } }
 */

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '../../memory/user-id-map.json');

// ── All tier accounts (from target-accounts.md) ───────────────────────────────

const TIER_ACCOUNTS = {
  // Tier 1 (quote-tweet only)
  1: [
    'saylor','naval','100trillionUSD','APompliano','willywoo','danheld',
    'LynAldenContact','maxkeiser','PeterMcCormack','jackmallers','nic_carter',
    'Breedlove22','saifedean','NickSzabo4','jimmysong','rektcapital',
    'natbrunell','PrestonPysh','intocryptoverse',
  ],
  // Tier 2 (selective replies)
  2: [
    'JeffBooth','CorySwan','CaitlinLong_','pete_rizzo_','stephanlivera',
    'real_vijay','hodlonaut','SimplyBitcoin','CarlBMenger','theionicXBT',
    'BitcoinPierre','BritishHodl','Croesus_BTC','TomerStrolight',
    'BitcoinSapiens','AdamBLiv','AaronvanW','NikoJilch','RomanReher',
    'blocktrainer','alanbwt','BITVOLT','bramk','Blockstream',
    'Vivek4real_','PunterJeff','Strategy','Metaplanet','LawrenceLepard',
    'stackhodler','BTC_for_Freedom','Dennis_Porter_','jameslavish',
    'Matt_Hougan','gerovich','RobynHD','BitPaine','AlanWolan',
    'JoshMandell6','crossbordercap','timevalueofbtc','WalkerAmerica',
    'parman_the','Rajatsoni','BitcoinIsSaving','TheGuySwann',
    'Eric_BIGfund','1MarkMoss','relai_app','Bitcoin_Teddy','River',
    'IIICapital',
  ],
  // Tier 3 (primary reply targets)
  3: [
    'RonSwanonson','BitmundFreud','fiatarchive','0_21_BTC','MrsHodl',
    'benjaminhodlin','BitcoinRothbard','Cole_Walmsley','stack2thefuture',
    'Handrev','mir_btc','DzambhalaHODL','just1nvest','MrRickLennon',
    'NikoJilch','bitcoin_hotel','bruceflorian','adamobrien','leonwankum',
    'sunny051488','RoaringRagnar','OnrampBitcoin','Dante_Cook1',
    'bitcoinmunger','PsychedelicBart','JaimeLeverton','macrojack21',
    'Scavacini777','kit_sats','BitcoinHopium','RunwithBitcoin',
    'moneyordebt','JAN3com',
  ],
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

function loadSecrets() {
  const lines = fs.readFileSync(path.join(__dirname, '../../.env.secrets'), 'utf8').split('\n');
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

function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, baseUrl, queryParams, ck, cs, tk, ts) {
  const op = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tk,
    oauth_version: '1.0',
  };
  const all = { ...op, ...queryParams };
  const sorted = Object.entries(all).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
  const base = [method.toUpperCase(), encode(baseUrl), encode(sorted)].join('&');
  const key = `${encode(cs)}&${encode(ts)}`;
  op.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(op).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}="${encode(v)}"`).join(', ');
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Fetch user IDs in batches of 100 ────────────────────────────────────────

async function fetchUserBatch(handles, secrets) {
  const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = secrets;
  const baseUrl = 'https://api.x.com/2/users/by';
  const queryParams = {
    usernames: handles.join(','),
    'user.fields': 'public_metrics',
  };
  const authHeader = oauthSign('GET', baseUrl, queryParams, ck, cs, tk, ts);
  const qs = Object.entries(queryParams).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const result = await httpsGet(`${baseUrl}?${qs}`, { Authorization: authHeader });
  if (result.status !== 200) {
    throw new Error(`User lookup failed: ${result.status} — ${JSON.stringify(result.body)}`);
  }
  return result.body.data || [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

const secrets = loadSecrets();
const allHandles = Object.entries(TIER_ACCOUNTS).flatMap(([tier, handles]) =>
  handles.map(h => ({ handle: h, tier: parseInt(tier) }))
);

// Deduplicate handles (some appear in multiple tiers)
const uniqueHandles = [...new Map(allHandles.map(a => [a.handle.toLowerCase(), a])).values()];
console.log(`Syncing ${uniqueHandles.length} unique tier accounts…`);
console.log(`Estimated cost: $${(uniqueHandles.length * 0.010).toFixed(2)} (one-time)`);

// Load existing map to avoid re-fetching
let existingMap = {};
if (fs.existsSync(OUT_PATH)) {
  try {
    const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    existingMap = existing.users || {};
    const existingCount = Object.keys(existingMap).length;
    console.log(`Loaded existing map with ${existingCount} users`);
  } catch { /* start fresh */ }
}

// Find handles not yet in the map
const existingHandles = new Set(Object.values(existingMap).map(u => u.handle.toLowerCase()));
const toFetch = uniqueHandles.filter(a => !existingHandles.has(a.handle.toLowerCase()));
console.log(`${toFetch.length} new accounts to fetch (${uniqueHandles.length - toFetch.length} already cached)`);

if (toFetch.length === 0) {
  console.log('✅ Map already up to date — no API calls needed');
} else {
  // Fetch in batches of 100 (API limit)
  const BATCH = 100;
  let fetched = 0;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const handles = batch.map(a => a.handle);
    console.log(`Fetching batch ${Math.floor(i/BATCH)+1}: ${handles.length} users…`);
    const users = await fetchUserBatch(handles, secrets);
    for (const user of users) {
      const meta = batch.find(a => a.handle.toLowerCase() === user.username.toLowerCase());
      existingMap[user.id] = {
        handle:    user.username,
        tier:      meta?.tier || 0,
        followers: user.public_metrics?.followers_count || 0,
      };
      fetched++;
    }
    console.log(`  Got ${users.length}/${handles.length} users (some may not exist)`);
  }
  console.log(`\nFetched ${fetched} user IDs`);
}

// Save map
const output = {
  syncedAt: new Date().toISOString(),
  userCount: Object.keys(existingMap).length,
  users: existingMap,
};
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`\n✅ Saved user-id-map to ${OUT_PATH} (${Object.keys(existingMap).length} users)`);
console.log('Future timeline fetches will skip User:Read expansion — $0.010/user/day eliminated.');
