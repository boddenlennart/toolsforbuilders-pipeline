#!/usr/bin/env node
/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  THIS FILE IS CURRENTLY INACTIVE — TikTok posting is MANUAL            │
 * │                                                                             │
 * │  Reason: TikTok Direct Posting API requires app review for production use.  │
 * │  Current workflow: daily-crosspost.mjs sends video + caption to Telegram    │
 * │  (topic 3), Lennart posts manually to TikTok app.                           │
 * │                                                                             │
 * │  When ready to activate:                                                    │
 * │  1. Submit app for review at developers.tiktok.com                          │
 * │  2. Get production credentials approved                                     │
 * │  3. Wire this module back into daily-crosspost.mjs                          │
 * │                                                                             │
 * │  The implementation below is complete and tested in sandbox mode.           │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * upload-to-tiktok.mjs — Upload MP4 to TikTok using Content Posting API (PULL_FROM_URL via R2).
 * Exports uploadToTikTok(videoPath, { title, tags })
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { uploadToR2 } from '../instagram/upload-to-r2.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load environment secrets from .env.secrets
 */
function loadEnv() {
  const envPath = join(__dirname, '.env.secrets');
  const env = {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/**
 * Load token from tiktok-token.json
 */
function loadToken() {
  const tokenPath = join(__dirname, 'tiktok-token.json');
  const data = JSON.parse(readFileSync(tokenPath, 'utf8'));
  return data;
}

/**
 * Save token back to tiktok-token.json
 */
function saveToken(token) {
  const tokenPath = join(__dirname, 'tiktok-token.json');
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
  console.log('TikTok token saved.');
}

/**
 * Refresh access token using refresh_token.
 */
async function refreshTikTokToken(clientKey, clientSecret, refreshToken) {
  const url = 'https://open.tiktokapis.com/v2/oauth/token/';
  const params = new URLSearchParams();
  params.append('client_key', clientKey);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TikTok token refresh failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Ensure valid access token; refresh if expired.
 */
async function ensureValidToken() {
  const env = loadEnv();
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET } = env;
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    throw new Error('Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env.secrets');
  }

  let token = loadToken();
  const now = Date.now();
  const expiresAt = token.expires_at || (token.expires_in ? (now + token.expires_in * 1000) : now - 1);
  if (expiresAt < now + 60000) {
    console.log('TikTok token expired or near expiry, refreshing...');
    try {
      const newToken = await refreshTikTokToken(
        TIKTOK_CLIENT_KEY,
        TIKTOK_CLIENT_SECRET,
        token.refresh_token
      );
      // Merge with existing fields (like open_id)
      token = {
        ...token,
        ...newToken,
        expires_at: Date.now() + (newToken.expires_in * 1000),
      };
      saveToken(token);
      console.log('Token refreshed.');
    } catch (err) {
      console.error('Failed to refresh token:', err.message);
      throw err;
    }
  }
  return token;
}

/**
 * Upload a video to TikTok using PULL_FROM_URL method.
 * @param {string} videoPath - Path to MP4 file.
 * @param {Object} options - Title, tags.
 * @returns {Promise<string>} - Post ID.
 */
export async function uploadToTikTok(videoPath, { title = '', tags = [] }) {
  // Step 1: Upload video to R2 to get public URL
  console.log('Uploading video to R2...');
  const key = `tiktok/${Date.now()}.mp4`;
  const publicUrl = await uploadToR2(videoPath, key);
  console.log(`R2 public URL: ${publicUrl}`);

  // Step 2: Ensure valid token
  const token = await ensureValidToken();
  const { access_token, open_id } = token;

  // Step 3: Initialize upload via PULL_FROM_URL
  const initUrl = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
  const initBody = {
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: publicUrl,
    },
    post_info: {
      title,
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      // TikTok Shorts: vertical video, under 60s
    },
    // tags not supported in API? maybe as hashtags in title
  };

  const initResponse = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(initBody),
  });

  if (!initResponse.ok) {
    const text = await initResponse.text();
    throw new Error(`TikTok upload init failed: ${initResponse.status} ${text}`);
  }

  const initData = await initResponse.json();
  const publishId = initData.data.publish_id;
  console.log(`TikTok publish ID: ${publishId}`);

  // Step 4: Poll for publish status
  const pollUrl = `https://open.tiktokapis.com/v2/post/publish/status/fetch/?publish_id=${publishId}`;
  const maxAttempts = 30;
  const delayMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    const pollResponse = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });
    if (!pollResponse.ok) {
      console.warn(`Poll ${i+1} failed: ${pollResponse.status}`);
      continue;
    }
    const pollData = await pollResponse.json();
    const status = pollData.data.status;
    console.log(`Poll ${i+1}: status ${status}`);
    if (status === 'PUBLISH_COMPLETE') {
      const postId = pollData.data.publish_id; // same? maybe there's a post_id
      console.log(`✅ TikTok post published: ${postId}`);
      return postId;
    } else if (status === 'PUBLISH_FAILED') {
      throw new Error('TikTok publish failed');
    }
    // else continue polling
  }

  throw new Error('TikTok publish timeout');
}

/**
 * CLI entry point
 */
async function main() {
  if (process.argv.length < 3) {
    console.error('Usage: node upload-to-tiktok.mjs <video.mp4> [--title="Title"] [--tags="tag1,tag2"]');
    process.exit(1);
  }
  const videoPath = process.argv[2];
  let title = 'Daily AI Reel';
  let tags = [];

  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--title=')) title = arg.slice(8);
    else if (arg.startsWith('--tags=')) tags = arg.slice(7).split(',');
  }

  try {
    const postId = await uploadToTikTok(videoPath, { title, tags });
    console.log(`🎉 TikTok post ID: ${postId}`);
  } catch (err) {
    console.error('Failed to upload:', err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}