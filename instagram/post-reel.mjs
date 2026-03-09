#!/usr/bin/env node
/**
 * post-reel.mjs — Upload a video as Instagram Reel using Graph API.
 * Requires video publicly accessible via URL (R2).
 */

import { loadEnv, retry } from './utils.mjs';
import { fileURLToPath } from 'url';

const env = loadEnv();
const IG_USER_ID = env.IG_USER_ID;
const IG_ACCESS_TOKEN = env.IG_ACCESS_TOKEN;
const API_BASE = 'https://graph.instagram.com/v22.0';

if (!IG_ACCESS_TOKEN) {
  throw new Error('IG_ACCESS_TOKEN not found in .env.secrets');
}

async function igApiCall(endpoint, method = 'GET', body = null) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Instagram API: ${data.error.message} (code: ${data.error.code})`);
  }
  
  return data;
}

async function createReelContainer(videoUrl, caption) {
  const endpoint = `/${IG_USER_ID}/media?access_token=${IG_ACCESS_TOKEN}`;
  const body = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: true,
  };
  
  return retry(async () => {
    console.log('   📤 Creating Reel container...');
    const result = await igApiCall(endpoint, 'POST', body);
    console.log(`   ✓ Container ID: ${result.id}`);
    return result.id;
  });
}

async function checkContainerStatus(containerId) {
  const endpoint = `/${containerId}?access_token=${IG_ACCESS_TOKEN}&fields=status_code,status`;
  const result = await igApiCall(endpoint);
  return result;
}

async function waitForContainerReady(containerId, maxWaitMs = 120000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkContainerStatus(containerId);
    
    if (status.status_code === 'FINISHED') {
      return true;
    }
    
    if (status.status_code === 'ERROR') {
      throw new Error(`Container processing failed: ${status.status}`);
    }
    
    console.log(`   ⏳ Container status: ${status.status_code}. Waiting...`);
    await new Promise(r => setTimeout(r, 5000));
  }
  
  throw new Error('Container processing timed out');
}

async function publishMedia(containerId) {
  const endpoint = `/${IG_USER_ID}/media_publish?access_token=${IG_ACCESS_TOKEN}&creation_id=${containerId}`;
  
  return retry(async () => {
    console.log('   🚀 Publishing Reel...');
    const result = await igApiCall(endpoint, 'POST');
    console.log(`   ✓ Published! Media ID: ${result.id}`);
    return result.id;
  });
}

/**
 * Upload a video as Instagram Reel.
 * @param {string} videoUrl - Publicly accessible video URL.
 * @param {string} caption - Caption text.
 * @returns {Promise<string>} - Published media ID.
 */
export async function uploadReelToInstagram(videoUrl, caption) {
  console.log('🎬 Uploading Reel to Instagram...');
  
  // Track container ID for orphan cleanup (Fix 8)
  let containerId = null;
  
  try {
    // Step 1: Create media container
    containerId = await createReelContainer(videoUrl, caption);
    
    // Step 2: Wait for processing
    await waitForContainerReady(containerId);
    
    // Step 3: Publish
    const publishedId = await publishMedia(containerId);
    
    return publishedId;
  } catch (err) {
    // Include container ID in error for manual cleanup if needed
    const containerInfo = containerId ? ` (orphaned container: ${containerId})` : '';
    console.error(`❌ Instagram post failed${containerInfo}`);
    throw new Error(`Instagram post failed${containerInfo}: ${err.message}`);
  }
}

/**
 * CLI entry point
 */
async function main() {
  if (process.argv.length < 3) {
    console.error('Usage: node post-reel.mjs <video_url> [--caption="Caption"]');
    process.exit(1);
  }
  const videoUrl = process.argv[2];
  let caption = 'Daily AI Reel';
  
  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--caption=')) caption = arg.slice(10);
  }
  
  try {
    const mediaId = await uploadReelToInstagram(videoUrl, caption);
    console.log(`✅ Reel published: ${mediaId}`);
  } catch (err) {
    console.error('Failed to post Reel:', err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}