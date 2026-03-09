#!/usr/bin/env node
// test-auth.mjs — Verify OAuth 1.0a credentials work
// Calls GET /2/users/me to confirm identity

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
function oauthSign(method, url, params, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tokenKey,
    oauth_version: '1.0',
    ...params,
  };

  const sortedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encode(url),
    encode(sortedParams),
  ].join('&');

  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  const authHeader = 'OAuth ' + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}="${encode(v)}"`)
    .join(', ');

  return authHeader;
}

function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
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

// --- Main ---
const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = env;

if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
  console.error('❌ Missing one or more OAuth 1.0a keys in .env.secrets');
  console.error('Expected: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET');
  process.exit(1);
}

const url = 'https://api.x.com/2/users/me';
const authHeader = oauthSign('GET', url, {}, TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET);

console.log('⏳ Testing credentials...\n');

const result = await httpsGet(url, { Authorization: authHeader });

if (result.status === 200 && result.body.data) {
  console.log('✅ Credentials working!');
  console.log(`   Logged in as: @${result.body.data.username} (${result.body.data.name})`);
  console.log(`   User ID: ${result.body.data.id}`);
} else {
  console.error('❌ Auth failed. Response:');
  console.error(JSON.stringify(result.body, null, 2));
}
