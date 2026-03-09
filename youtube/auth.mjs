#!/usr/bin/env node
/**
 * YouTube OAuth2 Authorization Script
 * Run once to generate a refresh token for the upload pipeline.
 * Usage: node auth.mjs
 */

import http from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load secrets
const secrets = Object.fromEntries(
  readFileSync(join(__dirname, '.env.secrets'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);

const CLIENT_ID     = secrets.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = secrets.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:8765/callback';
const SCOPES        = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES.join(' '))}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n🔐 YouTube OAuth Setup\n');
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for authorization...\n');

// Spin up a local server to catch the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8765');
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('No code received.');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>✅ Authorized! You can close this tab.</h2>');
  server.close();

  // Exchange code for tokens
  console.log('Got auth code, exchanging for tokens...');
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await resp.json();

  if (tokens.error) {
    console.error('❌ Token exchange failed:', tokens);
    process.exit(1);
  }

  // Save tokens
  const tokenPath = join(__dirname, 'youtube-token.json');
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`\n✅ Token saved to: ${tokenPath}`);
  console.log(`   Refresh token: ${tokens.refresh_token ? '✅ present' : '❌ MISSING (re-run script)'}`);
  console.log('\nSetup complete! You can now run the upload script.\n');
});

server.listen(8765, () => {});
