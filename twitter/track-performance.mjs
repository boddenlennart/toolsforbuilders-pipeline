#!/usr/bin/env node
// track-performance.mjs — Weekly performance report for @btcmaxistheway
// Pulls recent tweets, engagement metrics, follower count

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';

const USER_ID = '1821605462846140418';
const REPORT_PATH = '/root/.openclaw/workspace/memory/twitter-performance.jsonl';

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

const env = loadSecrets('/root/.openclaw/workspace/.env.secrets');
const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = env;

// --- Get user info (follower count) ---
const userBaseUrl = `https://api.x.com/2/users/${USER_ID}`;
const userParams = { 'user.fields': 'public_metrics' };
const userAuth = oauthSign('GET', userBaseUrl, userParams, ck, cs, tk, ts);
const userQs = Object.entries(userParams).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const userResult = await httpsGet(`${userBaseUrl}?${userQs}`, { Authorization: userAuth });

const followers = userResult.body?.data?.public_metrics?.followers_count ?? 0;
const following = userResult.body?.data?.public_metrics?.following_count ?? 0;

// --- Get recent tweets with metrics ---
const tweetsBaseUrl = `https://api.x.com/2/users/${USER_ID}/tweets`;
const tweetsParams = {
  max_results: '10',
  'tweet.fields': 'public_metrics,created_at,text',
  exclude: 'retweets,replies',
};
const tweetsAuth = oauthSign('GET', tweetsBaseUrl, tweetsParams, ck, cs, tk, ts);
const tweetsQs = Object.entries(tweetsParams).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const tweetsResult = await httpsGet(`${tweetsBaseUrl}?${tweetsQs}`, { Authorization: tweetsAuth });

const tweets = tweetsResult.body?.data ?? [];

// --- Calculate stats ---
const totalLikes = tweets.reduce((s, t) => s + t.public_metrics.like_count, 0);
const totalRTs = tweets.reduce((s, t) => s + t.public_metrics.retweet_count, 0);
const totalReplies = tweets.reduce((s, t) => s + t.public_metrics.reply_count, 0);
const avgLikes = tweets.length ? (totalLikes / tweets.length).toFixed(1) : 0;

const topTweet = tweets.sort((a, b) => {
  const score = t => t.public_metrics.like_count + t.public_metrics.retweet_count * 2 + t.public_metrics.reply_count;
  return score(b) - score(a);
})[0];

// --- Save to log ---
const report = {
  ts: new Date().toISOString(),
  followers,
  following,
  tweets_analyzed: tweets.length,
  total_likes: totalLikes,
  total_rts: totalRTs,
  total_replies: totalReplies,
  avg_likes: parseFloat(avgLikes),
  top_tweet_id: topTweet?.id,
  top_tweet_likes: topTweet?.public_metrics?.like_count,
  top_tweet_preview: topTweet?.text?.slice(0, 80),
};

fs.appendFileSync(REPORT_PATH, JSON.stringify(report) + '\n');

// --- POST to Life Dashboard ---
const todayStr = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Bangkok' });
try {
  const metricsPayload = {
    date: todayStr,
    followers,
    following,
    avg_likes: parseFloat(avgLikes),
    avg_retweets: (totalRTs / tweets.length).toFixed(1),
    top_tweet_id: topTweet?.id,
    top_tweet_text: topTweet?.text?.slice(0, 280),
  };
  
  const postRes = await fetch('http://localhost:3000/api/content-pipeline/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metricsPayload),
  });
  
  const postData = await postRes.json();
  if (postRes.ok) {
    console.log('\n✅ Metrics synced to Life Dashboard');
  } else {
    console.log('\n⚠️  Failed to sync metrics:', postData.error);
  }
} catch (err) {
  console.log('\n⚠️  Could not sync to Life Dashboard:', err.message);
}

// --- Print report ---
console.log('\n📊 @btcmaxistheway Weekly Performance Report');
console.log('='.repeat(50));
console.log(`👥 Followers:     ${followers}`);
console.log(`📝 Tweets sampled: ${tweets.length}`);
console.log(`❤️  Total likes:   ${totalLikes} (avg: ${avgLikes}/tweet)`);
console.log(`🔁 Total RTs:      ${totalRTs}`);
console.log(`💬 Total replies:  ${totalReplies}`);

if (topTweet) {
  console.log(`\n🏆 Top tweet:`);
  console.log(`   "${topTweet.text.slice(0, 100)}..."`);
  console.log(`   ❤️ ${topTweet.public_metrics.like_count} | 🔁 ${topTweet.public_metrics.retweet_count} | 💬 ${topTweet.public_metrics.reply_count}`);
  console.log(`   https://x.com/btcmaxistheway/status/${topTweet.id}`);
}

// --- Compare to last report ---
try {
  const lines = fs.readFileSync(REPORT_PATH, 'utf8').trim().split('\n');
  if (lines.length >= 2) {
    const prev = JSON.parse(lines[lines.length - 2]);
    const followerDiff = followers - prev.followers;
    const sign = followerDiff >= 0 ? '+' : '';
    console.log(`\n📈 Since last report: ${sign}${followerDiff} followers`);
  }
} catch(e) {}

console.log('\nReport saved to memory/twitter-performance.jsonl');
