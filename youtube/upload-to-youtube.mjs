#!/usr/bin/env node
/**
 * upload-to-youtube.mjs — Upload MP4 as YouTube Short.
 * Exports uploadToYouTube(videoPath, { title, description, tags })
 * Auto-refreshes token using refresh_token when expired.
 */

import { readFileSync, writeFileSync, createReadStream, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';

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
 * Load token from youtube-token.json
 */
function loadToken() {
  const tokenPath = join(__dirname, 'youtube-token.json');
  const data = JSON.parse(readFileSync(tokenPath, 'utf8'));
  return data;
}

/**
 * Save token back to youtube-token.json (atomic: write to tmp, then rename)
 */
function saveToken(token) {
  const tokenPath = join(__dirname, 'youtube-token.json');
  const tmpPath = join(__dirname, `youtube-token.${randomBytes(8).toString('hex')}.tmp`);
  try {
    writeFileSync(tmpPath, JSON.stringify(token, null, 2));
    renameSync(tmpPath, tokenPath);
    console.log('Token saved (atomic).');
  } catch (err) {
    // Clean up tmp file if rename failed
    try { if (existsSync(tmpPath)) require('fs').unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

/**
 * Ensure access token is valid; refresh if expired.
 */
async function ensureValidToken(oauth2Client) {
  const token = loadToken();
  oauth2Client.setCredentials(token);
  const now = Date.now();
  // Check BOTH expiry_date (Google SDK) AND expires_at (our format)
  const expiresAt = token.expiry_date || token.expires_at || (token.expires_in ? (now + token.expires_in * 1000) : now - 1);
  if (expiresAt < now + 60000) {
    console.log('Token expired or near expiry, refreshing...');
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const newToken = {
        ...token,
        ...credentials,
        expires_at: credentials.expires_at || (Date.now() + (credentials.expires_in || 3600) * 1000),
      };
      saveToken(newToken);
      oauth2Client.setCredentials(newToken);
      console.log('Token refreshed.');
    } catch (err) {
      console.error('Failed to refresh token:', err.message);
      throw err;
    }
  }
}

/**
 * Upload a video to YouTube Shorts.
 * @param {string} videoPath - Path to MP4 file.
 * @param {Object} options - Title, description, tags, thumbnailPath.
 * @returns {Promise<string>} - Video URL.
 */
export async function uploadToYouTube(videoPath, { title, description = '', tags = [], thumbnailPath = null }) {
  const env = loadEnv();
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    throw new Error('Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env.secrets');
  }

  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob' // no redirect URI needed for refresh token flow
  );

  await ensureValidToken(oauth2Client);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // YouTube Shorts: vertical video (1080x1920), duration <= 60s.
  const requestBody = {
    snippet: {
      title: title.includes('#Shorts') ? title : `${title} #Shorts`,
      description,
      tags,
      categoryId: '22', // "People & Blogs"
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    },
  };

  console.log(`Uploading ${videoPath}...`);
  const media = {
    body: createReadStream(videoPath),
  };

  try {
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media,
    });

    const videoId = res.data.id;
    const videoUrl = `https://youtu.be/${videoId}`;
    console.log(`✅ Uploaded: ${videoUrl}`);

    // Set custom thumbnail (hook slide image)
    let thumbnailSet = false;
    if (thumbnailPath && existsSync(thumbnailPath)) {
      try {
        console.log(`Setting thumbnail: ${thumbnailPath}`);
        await youtube.thumbnails.set({
          videoId,
          media: {
            mimeType: thumbnailPath.endsWith('.png') ? 'image/png' : 'image/jpeg',
            body: createReadStream(thumbnailPath),
          },
        });
        console.log('✅ Thumbnail set.');
        thumbnailSet = true;
      } catch (thumbErr) {
        const thumbStatus = thumbErr.status || thumbErr.response?.status;
        const thumbReason = thumbErr.errors?.[0]?.reason || thumbErr.response?.data?.error?.errors?.[0]?.reason;
        if (thumbStatus === 403 && thumbReason === 'forbidden') {
          console.warn('⚠️ Thumbnail not set — enable Custom thumbnails in YouTube Studio → Settings → Channel → Feature eligibility.');
        } else {
          console.warn(`⚠️ Thumbnail upload failed: ${thumbErr.message}`);
        }
        // Non-fatal — video still uploaded successfully
      }
    } else if (thumbnailPath) {
      console.warn(`⚠️ Thumbnail file not found: ${thumbnailPath} — skipping.`);
    }

    return { success: true, url: videoUrl, videoId, thumbnailSet };
  } catch (err) {
    // Detect quota exceeded errors (HTTP 403, reason quotaExceeded)
    const status = err.status || err.code || err.response?.status;
    const reason = err.errors?.[0]?.reason || err.response?.data?.error?.errors?.[0]?.reason;
    
    if (status === 403 || String(status) === '403') {
      if (reason === 'quotaExceeded') {
        console.warn('⚠️ YouTube quota exceeded. Will retry tomorrow.');
        return { success: false, error: 'YouTube quota exceeded. Will retry tomorrow.' };
      }
    }
    
    console.error('YouTube upload error:', err.response?.data?.error || err.message);
    throw err;
  }
}

/**
 * CLI entry point
 */
async function main() {
  if (process.argv.length < 3) {
    console.error('Usage: node upload-to-youtube.mjs <video.mp4> [--title="Title"] [--description="Desc"] [--tags="tag1,tag2"]');
    process.exit(1);
  }
  const videoPath = process.argv[2];
  let title = 'Daily AI Reel';
  let description = '';
  let tags = [];
  let thumbnailPath = null;

  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--title=')) title = arg.slice(8);
    else if (arg.startsWith('--description=')) description = arg.slice(14);
    else if (arg.startsWith('--tags=')) tags = arg.slice(7).split(',');
    else if (arg.startsWith('--thumbnail=')) thumbnailPath = arg.slice(12);
  }

  try {
    const result = await uploadToYouTube(videoPath, { title, description, tags, thumbnailPath });
    if (result.success) {
      console.log(`🎉 Video uploaded: ${result.url}`);
    } else {
      console.error(`❌ Upload failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to upload:', err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}