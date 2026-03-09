#!/usr/bin/env node
// scan-bitcoin.mjs — Scan trending Bitcoin content on X
// Uses Bearer Token for app-only search (read-only, cost-efficient)

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';

function loadSecrets(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
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

function oauthSign(method, baseUrl, queryParams, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tokenKey,
    oauth_version: '1.0',
  };
  const allParams = { ...oauthParams, ...queryParams };
  const sortedParams = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join('&');
  const baseString = [method.toUpperCase(), encode(baseUrl), encode(sortedParams)].join('&');
  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  oauthParams['oauth_signature'] = signature;
  return 'OAuth ' + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}="${encode(v)}"`)
    .join(', ');
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = env;

if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
  console.error('❌ Missing OAuth 1.0a credentials');
  process.exit(1);
}

const baseUrl = 'https://api.x.com/2/tweets/search/recent';
const queryParams = {
  query: 'bitcoin -is:retweet lang:en -is:reply',
  max_results: '10',
  'tweet.fields': 'public_metrics,created_at,author_id,text',
  expansions: 'author_id',
  'user.fields': 'username,name,public_metrics',
  sort_order: 'relevancy',
};

const authHeader = oauthSign('GET', baseUrl, queryParams, TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET);
const queryString = Object.entries(queryParams).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const headers = { Authorization: authHeader };

const url = `${baseUrl}?${queryString}`;

console.log('🔍 Scanning Bitcoin X space...\n');

const result = await httpsGet(url, headers);

if (result.status !== 200) {
  console.error('❌ API error:', JSON.stringify(result.body, null, 2));
  process.exit(1);
}

const tweets = result.body.data || [];
const users = {};
(result.body.includes?.users || []).forEach(u => users[u.id] = u);

if (tweets.length === 0) {
  console.log('No results found.');
  process.exit(0);
}

// Sort by engagement (likes + RTs + replies)
tweets.sort((a, b) => {
  const scoreA = a.public_metrics.like_count + a.public_metrics.retweet_count * 2 + a.public_metrics.reply_count;
  const scoreB = b.public_metrics.like_count + b.public_metrics.retweet_count * 2 + b.public_metrics.reply_count;
  return scoreB - scoreA;
});

console.log(`Found ${tweets.length} tweets (sorted by engagement):\n`);
console.log('='.repeat(80));

tweets.forEach((tweet, i) => {
  const user = users[tweet.author_id] || {};
  const m = tweet.public_metrics;
  console.log(`\n[${i + 1}] @${user.username || tweet.author_id} (${(user.public_metrics?.followers_count || 0).toLocaleString()} followers)`);
  console.log(`💬 ${tweet.text}`);
  console.log(`❤️  ${m.like_count} likes | 🔁 ${m.retweet_count} RTs | 💬 ${m.reply_count} replies`);
  console.log(`🕐 ${tweet.created_at}`);
  console.log('-'.repeat(80));
});
