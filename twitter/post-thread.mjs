#!/usr/bin/env node
// post-thread.mjs — Post a Twitter thread, optionally quoting a tweet
// Usage: node post-thread.mjs <thread.json>

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

function oauthSign(method, baseUrl, bodyParams, ck, cs, tk, ts) {
  const op = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tk,
    oauth_version: '1.0',
  };
  const all = { ...op };
  const sorted = Object.entries(all).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
  const base = [method.toUpperCase(), encode(baseUrl), encode(sorted)].join('&');
  const key = `${encode(cs)}&${encode(ts)}`;
  op.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(op).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}="${encode(v)}"`).join(', ');
}

function postTweet(body, ck, cs, tk, ts) {
  return new Promise((resolve, reject) => {
    const url = 'https://api.x.com/2/tweets';
    const authHeader = oauthSign('POST', url, {}, ck, cs, tk, ts);
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.x.com',
      path: '/2/tweets',
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Main ---
const threadFile = process.argv[2];
if (!threadFile) {
  console.error('Usage: node post-thread.mjs <thread.json>');
  process.exit(1);
}

const thread = JSON.parse(fs.readFileSync(threadFile, 'utf8'));
const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = env;

console.log(`\n🧵 Posting thread of ${thread.tweets.length} tweets...\n`);

let previousTweetId = null;

for (let i = 0; i < thread.tweets.length; i++) {
  const text = thread.tweets[i];
  const body = { text };

  if (i === 0 && thread.quote_tweet_id) {
    body.quote_tweet_id = thread.quote_tweet_id;
  }

  if (i === 0 && thread.reply_to_tweet_id) {
    body.reply = { in_reply_to_tweet_id: thread.reply_to_tweet_id };
  }

  if (i > 0 && previousTweetId) {
    body.reply = { in_reply_to_tweet_id: previousTweetId };
  }

  const result = await postTweet(body, ck, cs, tk, ts);

  if (result.status === 201 && result.body.data) {
    previousTweetId = result.body.data.id;
    console.log(`✅ Tweet ${i + 1}/${thread.tweets.length} posted`);
    console.log(`   https://x.com/btcmaxistheway/status/${previousTweetId}`);
    if (i < thread.tweets.length - 1) await sleep(2000); // avoid rate limits
  } else {
    console.error(`❌ Failed on tweet ${i + 1}:`);
    console.error(JSON.stringify(result.body, null, 2));
    process.exit(1);
  }
}

console.log('\n🎉 Thread posted successfully!');
console.log(`\nView thread: https://x.com/btcmaxistheway/status/${thread.tweets.length > 0 ? previousTweetId : ''}`);
