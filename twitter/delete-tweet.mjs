#!/usr/bin/env node
// delete-tweet.mjs — Delete a tweet by ID
// Usage: node delete-tweet.mjs <tweet_id>

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

function oauthSign(method, url, ck, cs, tk, ts) {
  const op = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tk,
    oauth_version: '1.0',
  };
  const sorted = Object.entries(op).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
  const base = [method.toUpperCase(), encode(url), encode(sorted)].join('&');
  const key = `${encode(cs)}&${encode(ts)}`;
  op.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(op).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}="${encode(v)}"`).join(', ');
}

const tweetId = process.argv[2];
if (!tweetId) { console.error('Usage: node delete-tweet.mjs <tweet_id>'); process.exit(1); }

const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = env;

const url = `https://api.x.com/2/tweets/${tweetId}`;
const auth = oauthSign('DELETE', url, ck, cs, tk, ts);

const result = await new Promise((resolve, reject) => {
  const req = https.request({ hostname: 'api.x.com', path: `/2/tweets/${tweetId}`, method: 'DELETE', headers: { Authorization: auth } }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
  });
  req.on('error', reject);
  req.end();
});

if (result.status === 200 && result.body.data?.deleted) {
  console.log(`✅ Tweet ${tweetId} deleted.`);
} else {
  console.error('❌ Failed:', JSON.stringify(result.body, null, 2));
}
