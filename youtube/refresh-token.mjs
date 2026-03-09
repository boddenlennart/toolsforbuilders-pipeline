#!/usr/bin/env node
/**
 * YouTube OAuth2 token refresh script.
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

async function refreshToken() {
  try {
    const env = loadEnv();
    const CLIENT_ID = env.YOUTUBE_CLIENT_ID;
    const CLIENT_SECRET = env.YOUTUBE_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env.secrets');
    }

    const tokenPath = join(__dirname, 'youtube-token.json');
    if (!existsSync(tokenPath)) {
      throw new Error('youtube-token.json not found');
    }

    const tokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      throw new Error('No refresh_token found in youtube-token.json');
    }

    console.log('🔄 Refreshing YouTube token...');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Token refresh failed:', result);
      process.exit(1);
    }

    // Merge new tokens with existing (preserve refresh_token if not returned)
    const updatedToken = {
      ...tokenData,
      access_token: result.access_token,
      expires_in: result.expires_in || 3600,
      token_type: result.token_type || 'Bearer',
      // refresh_token may be omitted; keep existing if not returned
      ...(result.refresh_token ? { refresh_token: result.refresh_token } : {}),
      // Google may also return scope
      ...(result.scope ? { scope: result.scope } : {}),
    };

    writeFileSync(tokenPath, JSON.stringify(updatedToken, null, 2));
    console.log('✅ YouTube token refreshed successfully');
    console.log(`   New access_token expires in ${updatedToken.expires_in} seconds`);
    console.log(`   Saved to ${tokenPath}`);

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