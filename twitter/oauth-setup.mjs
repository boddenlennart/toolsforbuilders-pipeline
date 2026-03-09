#!/usr/bin/env node
// oauth-setup.mjs — X OAuth 2.0 PKCE flow
// Run once to authorize posting to @btcmaxistheway

import crypto from 'crypto';
import https from 'https';
import readline from 'readline';
import fs from 'fs';

// --- Load secrets manually (no dotenv dependency) ---
const SECRETS_PATH = '/root/.openclaw/workspace/.env.secrets';

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

function saveTokens(accessToken, refreshToken) {
  let secrets = fs.readFileSync(SECRETS_PATH, 'utf8');
  // Remove existing token lines if present
  secrets = secrets.split('\n')
    .filter(l => !l.startsWith('TWITTER_ACCESS_TOKEN=') && !l.startsWith('TWITTER_REFRESH_TOKEN='))
    .join('\n')
    .trim();
  secrets += `\nTWITTER_ACCESS_TOKEN=${accessToken}`;
  if (refreshToken) secrets += `\nTWITTER_REFRESH_TOKEN=${refreshToken}`;
  fs.writeFileSync(SECRETS_PATH, secrets + '\n');
}

function exchangeCode(clientId, clientSecret, code, verifier, redirectUri) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }).toString();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const options = {
      hostname: 'api.x.com',
      path: '/2/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`${json.error}: ${json.error_description}`));
          else resolve(json);
        } catch (e) {
          reject(new Error('Failed to parse response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Main ---
const env = loadSecrets(SECRETS_PATH);
const CLIENT_ID = env['TWITTER_CLIENT_ID'];
const CLIENT_SECRET = env['TWITTER_CLIENT_SECRET'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET in .env.secrets');
  process.exit(1);
}

const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');
const REDIRECT_URI = 'https://localhost';
const SCOPES = 'tweet.read tweet.write users.read follows.read offline.access';

const authUrl = new URL('https://x.com/i/oauth2/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

console.log('\n========================================');
console.log('   X OAuth 2.0 Setup — @btcmaxistheway');
console.log('========================================\n');
console.log('Step 1: Open this URL in your browser:\n');
console.log(authUrl.toString());
console.log('\n----------------------------------------');
console.log('Step 2: Authorize the app when prompted.');
console.log('\nStep 3: Your browser will redirect to a');
console.log('localhost URL that shows a connection error.');
console.log('That is NORMAL. Just copy the full URL');
console.log('from your browser address bar.\n');
console.log('It will look like:');
console.log('https://localhost/?state=...&code=...\n');
console.log('----------------------------------------\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the full redirect URL here and press Enter:\n> ', async (redirectUrl) => {
  rl.close();

  try {
    const url = new URL(redirectUrl.trim());
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    if (!code) {
      console.error('\n❌ No authorization code found in URL. Did you copy the full URL?');
      process.exit(1);
    }

    if (returnedState !== state) {
      console.error('\n❌ State mismatch — please run the script again.');
      process.exit(1);
    }

    console.log('\n⏳ Exchanging code for tokens...');

    const tokenData = await exchangeCode(CLIENT_ID, CLIENT_SECRET, code, codeVerifier, REDIRECT_URI);

    saveTokens(tokenData.access_token, tokenData.refresh_token);

    console.log('\n✅ OAuth setup complete!');
    console.log('Access token and refresh token saved securely to .env.secrets');
    console.log('\nYour account is now authorized. You can start posting.');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
});
