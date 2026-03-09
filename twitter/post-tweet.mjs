#!/usr/bin/env node
// post-tweet.mjs — Post a tweet to @btcmaxistheway
// Usage: node post-tweet.mjs "Your tweet text here"
// NEVER called without Lennart's explicit approval.

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';

// --- Load secrets ---
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

// --- OAuth 1.0a signing ---
function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, url, bodyParams, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tokenKey,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...bodyParams };
  const sortedParams = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join('&');

  const baseString = [method.toUpperCase(), encode(url), encode(sortedParams)].join('&');
  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  return 'OAuth ' + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}="${encode(v)}"`)
    .join(', ');
}

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
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
    req.write(bodyStr);
    req.end();
  });
}

// --- Main ---
const tweetText = process.argv[2];

if (!tweetText) {
  console.error('Usage: node post-tweet.mjs "Your tweet text here"');
  process.exit(1);
}

if (tweetText.length > 280) {
  console.error(`❌ Tweet is too long: ${tweetText.length} characters (max 280)`);
  process.exit(1);
}

const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = env;

if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
  console.error('❌ Missing OAuth 1.0a credentials in .env.secrets');
  process.exit(1);
}

const url = 'https://api.x.com/2/tweets';
const body = { text: tweetText };
const authHeader = oauthSign('POST', url, {}, TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET);

console.log(`⏳ Posting tweet (${tweetText.length} chars)...`);

const result = await httpsPost(url, body, { Authorization: authHeader });

if (result.status === 201 && result.body.data) {
  const tweetId = result.body.data.id;
  console.log(`✅ Tweet posted!`);
  console.log(`   https://x.com/btcmaxistheway/status/${tweetId}`);
} else {
  console.error('❌ Failed to post tweet:');
  console.error(JSON.stringify(result.body, null, 2));
  process.exit(1);
}
