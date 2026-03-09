#!/usr/bin/env node
/**
 * TikTok OAuth2 token refresh script.
 * Run via cron to keep access_token valid.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, '.env.secrets');
  if (!existsSync(envPath)) {
    throw new Error('.env.secrets not found');
  }
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...valueParts] = line.split('=');
    env[key.trim()] = valueParts.join('=').trim();
  }
  return env;
}

function loadToken() {
  const tokenPath = join(__dirname, 'tiktok-token.json');
  if (!existsSync(tokenPath)) {
    throw new Error('tiktok-token.json not found');
  }
  const data = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  return data;
}

function saveToken(token) {
  const tokenPath = join(__dirname, 'tiktok-token.json');
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
  console.log('Token saved to', tokenPath);
}

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

async function refreshToken() {
  try {
    const env = loadEnv();
    const CLIENT_KEY = env.TIKTOK_CLIENT_KEY;
    const CLIENT_SECRET = env.TIKTOK_CLIENT_SECRET;

    if (!CLIENT_KEY || !CLIENT_SECRET) {
      throw new Error('Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env.secrets');
    }

    const token = loadToken();
    const refreshTokenValue = token.refresh_token;

    if (!refreshTokenValue) {
      throw new Error('No refresh_token found in tiktok-token.json');
    }

    console.log('🔄 Refreshing TikTok token...');

    const newToken = await refreshTikTokToken(CLIENT_KEY, CLIENT_SECRET, refreshTokenValue);

    // Merge with existing fields (like open_id) and compute expires_at
    const updatedToken = {
      ...token,
      ...newToken,
      expires_at: Date.now() + (newToken.expires_in * 1000),
    };

    saveToken(updatedToken);
    console.log('✅ TikTok token refreshed successfully');
    console.log(`   New access_token expires in ${newToken.expires_in} seconds`);
    console.log(`   Saved to ${join(__dirname, 'tiktok-token.json')}`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshToken();
}

export { refreshToken };