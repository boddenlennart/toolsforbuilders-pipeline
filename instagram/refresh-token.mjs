#!/usr/bin/env node
// refresh-token.mjs — Refresh Instagram long-lived access token
// Run: node refresh-token.mjs
// PM2 Cron: 0 0 1 * * (1st of each month at midnight UTC)
//
// Instagram long-lived tokens expire after 60 days.
// This script refreshes the token and updates .env.secrets.

import { readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, formatBangkokTimestamp } from './utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = `${__dirname}/.env.secrets`;

const env = loadEnv();
const IG_ACCESS_TOKEN = env.IG_ACCESS_TOKEN;

if (!IG_ACCESS_TOKEN) {
  console.error('❌ IG_ACCESS_TOKEN not found in .env.secrets');
  process.exit(1);
}

async function getTokenInfo(token) {
  const url = `https://graph.instagram.com/me?fields=id,username&access_token=${token}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Token info error: ${data.error.message}`);
  }
  
  return data;
}

async function refreshToken(token) {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Refresh error: ${data.error.message}`);
  }
  
  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in // seconds
  };
}

function updateEnvFile(newToken) {
  const content = readFileSync(ENV_PATH, 'utf-8');
  
  // Replace the access token line
  const updated = content.replace(
    /IG_ACCESS_TOKEN=.*/,
    `IG_ACCESS_TOKEN=${newToken}`
  );
  
  // Update the generated date comment
  const withDate = updated.replace(
    /# Generated:.*/,
    `# Generated: ${new Date().toISOString().split('T')[0]}`
  );
  
  writeFileSync(ENV_PATH, withDate);
  console.log('   ✓ Updated .env.secrets');
}

function formatExpiry(expiresInSeconds) {
  const days = Math.floor(expiresInSeconds / 86400);
  const expiryDate = new Date(Date.now() + expiresInSeconds * 1000);
  return `${days} days (${expiryDate.toISOString().split('T')[0]})`;
}

async function main() {
  console.log('='.repeat(50));
  console.log('🔄 INSTAGRAM TOKEN REFRESH');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log('='.repeat(50));
  
  // Step 1: Verify current token
  console.log('\n📋 Step 1: Verifying current token...');
  
  try {
    const info = await getTokenInfo(IG_ACCESS_TOKEN);
    console.log(`   ✓ Token is valid`);
    console.log(`   Account: @${info.username} (ID: ${info.id})`);
  } catch (error) {
    console.error(`   ❌ Current token is invalid: ${error.message}`);
    console.error('\n⚠️ You need to generate a new token manually:');
    console.error('   1. Go to Meta Developer Portal');
    console.error('   2. Generate a new long-lived token');
    console.error('   3. Update IG_ACCESS_TOKEN in .env.secrets');
    process.exit(1);
  }
  
  // Step 2: Refresh token
  console.log('\n🔄 Step 2: Refreshing token...');
  
  try {
    const newToken = await refreshToken(IG_ACCESS_TOKEN);
    console.log(`   ✓ Token refreshed successfully`);
    console.log(`   Expires in: ${formatExpiry(newToken.expiresIn)}`);
    
    // Step 3: Verify new token
    console.log('\n✅ Step 3: Verifying new token...');
    const verifyInfo = await getTokenInfo(newToken.accessToken);
    console.log(`   ✓ New token is valid`);
    console.log(`   Account: @${verifyInfo.username}`);
    
    // Step 4: Update .env.secrets
    console.log('\n💾 Step 4: Saving new token...');
    updateEnvFile(newToken.accessToken);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Token refresh complete!');
    console.log(`   New token expires: ${formatExpiry(newToken.expiresIn)}`);
    console.log('='.repeat(50));

    // Ping Uptime Kuma — confirms monthly IG token refresh ran successfully
    try {
      await fetch('http://localhost:3002/api/push/194bf054be504ee3f7925eff57d81cbd?status=up&msg=OK');
    } catch (e) { /* non-critical */ }
    
  } catch (error) {
    console.error(`   ❌ Refresh failed: ${error.message}`);
    console.error('\n⚠️ If token is close to expiry, generate a new one manually.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
