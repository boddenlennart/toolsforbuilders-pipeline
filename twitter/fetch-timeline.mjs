#!/usr/bin/env node
// fetch-timeline.mjs — Fetch and rank tweets from home timeline for reply opportunities
// v2: Pagination, tier-based scoring, engagement velocity, freshness bonuses
// Used by morning-intelligence.mjs for Grok-powered draft generation

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_ID = '1821605462846140418';
const USER_MAP_PATH = path.join(__dirname, '../../memory/user-id-map.json');

// Load local user-id-map if available — eliminates User:Read API charges
let _userIdMap = null;
try {
  const mapFile = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
  _userIdMap = mapFile.users || null;
  if (_userIdMap && Object.keys(_userIdMap).length > 0) {
    console.log(`[cost-opt] user-id-map loaded (${Object.keys(_userIdMap).length} users) — User:Read charges bypassed`);
  }
} catch {
  _userIdMap = null; // Map not yet built — will fall back to expansion (higher cost)
}

// === TIER DEFINITIONS ===
// From target-accounts.md — keep in sync
const TIER_1 = new Set([
  'saylor', 'naval', '100trillionUSD', 'APompliano', 'danheld',
  'LynAldenContact', 'maxkeiser', 'PeterMcCormack', 'jackmallers',
  'Breedlove22', 'nic_carter', 'saifedean', 'JeffBooth', 'NickSzabo4',
  'jimmysong', 'rektcapital', 'scottmelker'
].map(h => h.toLowerCase()));

const TIER_2 = new Set([
  'Excellion', 'CorySwan', 'CaitlinLong_', 'pete_rizzo_', 'stephanlivera',
  'real_vijay', 'hodlonaut', 'SimplyBitcoin', 'CarlBMenger', 'theionicXBT',
  'BitcoinPierre', 'BritishHodl', 'Croesus_BTC', 'TomerStrolight',
  'BitcoinSapiens', 'AdamBLiv', 'AaronvanW', 'NikoJilch', 'RomanReher',
  'blocktrainer', 'alanbwt', 'BITVOLT', 'bramk', 'Blockstream',
  'Vivek4real_', 'PunterJeff', 'Strategy', 'Metaplanet', 'LawrenceLepard',
  'stackhodler', 'BTC_for_Freedom'
].map(h => h.toLowerCase()));

const TIER_3 = new Set([
  'BitcoinMagazine', 'DocumentingBTC', 'BitcoinArchive', 'glassnode',
  'DylanLeClair', 'KobeissiLetter', 'willywoo', 'CryptoHayes',
  'MicroStrategy', 'jameslavish', 'Dennis_Porter_', 'stack2thefuture',
  'Handrev', 'leonwankum', 'bitcoinmunger', 'jaymesrosenthal',
  'adamobrien', 'RoaringRagnar', 'Cole_Walmsley', 'bruceflorian',
  'bitcoin_hotel', 'OnrampBitcoin', 'sunny051488', 'Dante_Cook1'
].map(h => h.toLowerCase()));

const EXCLUDE = new Set([
  'SpaceX', 'charliekirk11', 'JDVance', 'RayDalio', 'AnthropicAI',
  'WatcherGuru', 'thedankoe', 'PeterDiamandis', 'Stacks', 'kian_sasan',
  'steipete', 'openclaw'
].map(h => h.toLowerCase()));

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

/**
 * Get the tier for an account handle (1, 2, 3, or 0 for untiered)
 */
function getTier(handle) {
  const h = handle.toLowerCase();
  if (EXCLUDE.has(h)) return -1; // Exclude
  if (TIER_1.has(h)) return 1;
  if (TIER_2.has(h)) return 2;
  if (TIER_3.has(h)) return 3;
  return 0; // Unknown account
}

/**
 * Calculate engagement score with velocity and freshness adjustments.
 * 
 * Formula:
 * - Base engagement: likes + (retweets * 2) + (replies * 1.5)
 * - Velocity: base / sqrt(hoursOld) — rewards recent engagement
 * - Freshness bonus: 1.5x for <1h, 1.2x for 1-3h, 0.8x for >6h
 * - Tier multiplier: Tier 1 = 3x, Tier 2 = 2x, Tier 3 = 1x, Unknown = 0.5x
 * - Type penalty: Replies 0.3x (hard to engage), Quotes 0.8x
 */
function calculateScore(tweet, now = Date.now()) {
  const { likes, retweets, replies, createdAt, tier, isReply, isQuote } = tweet;
  
  // Base engagement (weighted)
  const baseEngagement = likes + (retweets * 2) + (replies * 1.5);
  
  // Time-based velocity
  const hoursOld = Math.max(0.5, (now - new Date(createdAt).getTime()) / (3600 * 1000));
  const velocityScore = baseEngagement / Math.sqrt(hoursOld);
  
  // Freshness bonus (early replies matter)
  let freshnessMultiplier = 1.0;
  if (hoursOld < 1) freshnessMultiplier = 1.5;      // Just posted — prime time
  else if (hoursOld < 3) freshnessMultiplier = 1.2; // Still fresh
  else if (hoursOld > 6) freshnessMultiplier = 0.8; // Getting stale
  
  // Tier multiplier (Tier 1 = highest ROI for replies)
  let tierMultiplier = 0.5; // Unknown accounts
  if (tier === 1) tierMultiplier = 3.0;
  else if (tier === 2) tierMultiplier = 2.0;
  else if (tier === 3) tierMultiplier = 1.0;
  
  // Tweet type penalty
  let typeMultiplier = 1.0;
  if (isReply) typeMultiplier = 0.3;      // Hard to engage, less visible
  else if (isQuote) typeMultiplier = 0.8; // Okay but needs more context
  
  // Final score
  const score = velocityScore * freshnessMultiplier * tierMultiplier * typeMultiplier;
  
  return Math.round(score * 100) / 100; // Round to 2 decimals
}

/**
 * Fetch a single page of timeline results
 */
async function fetchTimelinePage(secrets, paginationToken = null, maxResults = 100, excludeRetweets = true, sinceId = null) {
  const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = secrets;
  
  const baseUrl = `https://api.x.com/2/users/${USER_ID}/timelines/reverse_chronological`;
  const queryParams = {
    max_results: String(Math.min(maxResults, 100)),
    'tweet.fields': 'public_metrics,created_at,author_id,text,referenced_tweets',
  };

  // Only request user expansion when local map is unavailable (costs $0.010/user)
  if (!_userIdMap) {
    queryParams.expansions = 'author_id';
    queryParams['user.fields'] = 'username,name,public_metrics';
  }
  
  if (excludeRetweets) {
    queryParams.exclude = 'retweets';
  }
  
  if (paginationToken) {
    queryParams.pagination_token = paginationToken;
  }

  // since_id tells X to only return tweets newer than this ID — reduces reads charged
  if (sinceId) {
    queryParams.since_id = sinceId;
  }
  
  const authHeader = oauthSign('GET', baseUrl, queryParams, ck, cs, tk, ts);
  const qs = Object.entries(queryParams).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  const result = await httpsGet(`${baseUrl}?${qs}`, { Authorization: authHeader });
  
  if (result.status !== 200) {
    throw new Error(`Timeline fetch failed: ${result.status} — ${JSON.stringify(result.body)}`);
  }
  
  return result.body;
}

/**
 * Fetch tweets from home timeline with pagination and intelligent ranking.
 * 
 * @param {object} opts
 * @param {number} opts.maxTweets - total tweets to fetch across pages (default 200, max 300)
 * @param {number} opts.hoursBack - only return tweets newer than this (default 14)
 * @param {boolean} opts.excludeRetweets - skip retweets (default true)
 * @param {boolean} opts.excludeReplies - skip reply tweets from results (default false)
 * @param {string[]} opts.filterAccounts - only return tweets from these handles (optional)
 * @param {Set<string>} opts.seenIds - tweet IDs to skip (for deduplication across scans)
 * @param {boolean} opts.tieredOnly - only return Tier 1/2/3 accounts (default true)
 * @returns {Promise<Array>} Ranked tweets with score and tier fields
 */
export async function fetchTimeline({ 
  maxTweets = 100, 
  hoursBack = 14, 
  excludeRetweets = true,
  excludeReplies = false,
  filterAccounts = [],
  seenIds = new Set(),
  tieredOnly = true,
  sinceId = null,
} = {}) {
  const env = loadSecrets();
  const now = Date.now();
  const cutoff = new Date(now - hoursBack * 60 * 60 * 1000);
  
  let allTweets = [];
  let users = {};
  let paginationToken = null;
  let pagesNeeded = Math.ceil(Math.min(maxTweets, 300) / 100);
  
  // Fetch pages
  for (let page = 0; page < pagesNeeded; page++) {
    // Only pass sinceId on first page — subsequent pages use pagination_token instead
    const pagesSinceId = page === 0 ? sinceId : null;
    const response = await fetchTimelinePage(env, paginationToken, 100, excludeRetweets, pagesSinceId);
    
    const tweets = response.data || [];
    (response.includes?.users || []).forEach(u => users[u.id] = u);
    
    allTweets.push(...tweets);
    
    // Check if we have more pages
    paginationToken = response.meta?.next_token;
    if (!paginationToken) break;
    
    // Stop if we have enough or all tweets are too old
    if (allTweets.length >= maxTweets) break;
    const lastTweet = tweets[tweets.length - 1];
    if (lastTweet && new Date(lastTweet.created_at) < cutoff) break;
  }
  
  // Normalize and score tweets
  const normalized = allTweets
    .filter(t => new Date(t.created_at) > cutoff)
    .filter(t => !t.text.startsWith('RT @')) // Exclude manual retweets
    .map(t => {
      // Resolve user from local map (free) or from API expansion (charged)
      let handle, followers, tier;
      if (_userIdMap && _userIdMap[t.author_id]) {
        const mapped = _userIdMap[t.author_id];
        handle    = mapped.handle;
        followers = mapped.followers;
        tier      = mapped.tier;
      } else if (_userIdMap) {
        // author_id not in map — unknown account, skip (tier = 0, filtered out)
        handle    = 'unknown';
        followers = 0;
        tier      = 0;
      } else {
        // No map — use expansion data from API response
        const user = users[t.author_id] || {};
        handle    = user.username || 'unknown';
        followers = user.public_metrics?.followers_count || 0;
        tier      = getTier(handle);
      }
      const m = t.public_metrics || {};
      
      // Detect tweet type from referenced_tweets
      const refs = t.referenced_tweets || [];
      const isReply = refs.some(r => r.type === 'replied_to');
      const isQuote = refs.some(r => r.type === 'quoted');
      
      const tweet = {
        id: t.id,
        url: `https://x.com/${handle}/status/${t.id}`,
        author: handle,
        authorName: handle,
        followers,
        text: t.text,
        likes: m.like_count || 0,
        retweets: m.retweet_count || 0,
        replies: m.reply_count || 0,
        createdAt: t.created_at,
        tier,
        isReply,
        isQuote,
      };
      
      tweet.score = calculateScore(tweet, now);
      return tweet;
    });
  
  // Filter out excluded accounts
  let filtered = normalized.filter(t => t.tier !== -1);
  
  // Filter out seen IDs
  if (seenIds.size > 0) {
    filtered = filtered.filter(t => !seenIds.has(t.id));
  }
  
  // Filter by specific accounts if requested
  if (filterAccounts.length > 0) {
    const handles = new Set(filterAccounts.map(a => a.replace('@', '').toLowerCase()));
    filtered = filtered.filter(t => handles.has(t.author.toLowerCase()));
  }
  
  // Filter to tiered accounts only if requested
  if (tieredOnly) {
    filtered = filtered.filter(t => t.tier >= 1 && t.tier <= 3);
  }
  
  // Exclude replies if requested
  if (excludeReplies) {
    filtered = filtered.filter(t => !t.isReply);
  }
  
  // Sort by score (highest first)
  return filtered.sort((a, b) => b.score - a.score);
}

/**
 * Get top tweets optimized for Grok analysis.
 * Returns fewer tweets with richer context.
 * 
 * @param {object} opts - Same as fetchTimeline, plus:
 * @param {number} opts.topN - Number of top tweets to return (default 30)
 */
export async function fetchTopTweets({ topN = 30, ...opts } = {}) {
  const tweets = await fetchTimeline(opts);
  return tweets.slice(0, topN);
}

/**
 * Format tweets for Grok context (compact representation).
 * Groups by tier and provides scoring rationale.
 */
export function formatForGrok(tweets) {
  const tier1 = tweets.filter(t => t.tier === 1);
  const tier2 = tweets.filter(t => t.tier === 2);
  const tier3 = tweets.filter(t => t.tier === 3);
  
  const format = (t, i) => {
    const age = Math.round((Date.now() - new Date(t.createdAt).getTime()) / (3600 * 1000) * 10) / 10;
    const type = t.isReply ? '[reply]' : t.isQuote ? '[quote]' : '';
    return `[${i + 1}] @${t.author} (${(t.followers/1000).toFixed(0)}K) ${type}
"${t.text.slice(0, 200)}${t.text.length > 200 ? '...' : ''}"
Score: ${t.score} | ❤️${t.likes} 🔁${t.retweets} 💬${t.replies} | ${age}h ago
${t.url}`;
  };
  
  let output = `=== RANKED TWEETS FOR REPLY OPPORTUNITIES ===
Scoring: Tier weight × engagement velocity × freshness
Tier 1 = max reach, Tier 2 = relationship building, Tier 3 = selective only

`;
  
  if (tier1.length > 0) {
    output += `--- TIER 1 (Priority: High Reach) ---\n`;
    output += tier1.map(format).join('\n\n') + '\n\n';
  }
  
  if (tier2.length > 0) {
    output += `--- TIER 2 (Priority: Build Relationships) ---\n`;
    output += tier2.map(format).join('\n\n') + '\n\n';
  }
  
  if (tier3.length > 0) {
    output += `--- TIER 3 (Selective Only) ---\n`;
    output += tier3.map(format).join('\n\n') + '\n\n';
  }
  
  return output;
}

// === CLI USAGE ===
if (process.argv[1]?.includes('fetch-timeline')) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace('--','').split('=')));
  
  const tweets = await fetchTimeline({
    hoursBack: parseInt(args.hours || 14),
    maxTweets: parseInt(args.max || 200),
    tieredOnly: args.all !== 'true',
    excludeReplies: args.noreplies === 'true',
  });
  
  console.log(`\n✅ ${tweets.length} tweets fetched and ranked\n`);
  console.log(`Tier breakdown: T1=${tweets.filter(t=>t.tier===1).length} | T2=${tweets.filter(t=>t.tier===2).length} | T3=${tweets.filter(t=>t.tier===3).length}\n`);
  
  const topN = parseInt(args.show || 15);
  tweets.slice(0, topN).forEach((t, i) => {
    const tierLabel = t.tier === 1 ? '🔥T1' : t.tier === 2 ? '⭐T2' : t.tier === 3 ? '📌T3' : '❓';
    const type = t.isReply ? ' [reply]' : t.isQuote ? ' [quote]' : '';
    console.log(`[${i+1}] ${tierLabel} @${t.author}${type} — Score: ${t.score}`);
    console.log(`    ${t.text.slice(0, 100)}${t.text.length > 100 ? '...' : ''}`);
    console.log(`    ❤️ ${t.likes} | 🔁 ${t.retweets} | 💬 ${t.replies}`);
    console.log(`    🔗 ${t.url}\n`);
  });
  
  if (args.grok === 'true') {
    console.log('\n' + '='.repeat(60) + '\n');
    console.log(formatForGrok(tweets.slice(0, 30)));
  }
}
