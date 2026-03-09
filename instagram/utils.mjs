// utils.mjs — Shared utilities for Instagram pipeline
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.secrets
export function loadEnv() {
  const envPath = `${__dirname}/.env.secrets`;
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

// Bangkok time helpers (UTC+7)
export function getBangkokTime() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

export function formatBangkokDate(date = new Date()) {
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().split('T')[0];
}

export function formatBangkokTimestamp() {
  const bangkok = getBangkokTime();
  return bangkok.toISOString().replace('T', ' ').substring(0, 19) + ' ICT';
}

// JSON file helpers
export function readJSON(filename) {
  const path = `${__dirname}/data/${filename}`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error(`Error reading ${filename}:`, e.message);
    return null;
  }
}

export function writeJSON(filename, data) {
  const path = `${__dirname}/data/${filename}`;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`✓ Saved ${filename}`);
}

// Retry wrapper for API calls
export async function retry(fn, maxAttempts = 3, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
      if (attempt < maxAttempts) {
        console.log(`Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        delayMs *= 2; // Exponential backoff
      }
    }
  }
  throw lastError;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Content pillars
export const PILLARS = [
  'Tool Reviews & Tutorials',
  'Workflow Breakdowns',
  'Solopreneur Mindset',
  'Tool Stacks & Comparisons',
  'Quick Tips & Hacks'
];

// Brand colors
export const BRAND = {
  blue: '#0066FF',
  blueDark: '#0052CC', // gradient bottom color
  cream: '#F5F5F0',
  charcoal: '#1A1A1A',
  lime: '#BFFF00',
  purple: '#8B5CF6'
};

// Paths
export const PATHS = {
  root: __dirname,
  data: `${__dirname}/data`,
  posts: `${__dirname}/data/posts`,
  publicImages: '/root/.openclaw/workspace/life-dash/public/ig-posts',
  // Image base URL - must be publicly accessible with valid SSL for Instagram API
  // Options:
  // 1. Cloudflare R2: https://pub-xxx.r2.dev/ig-posts
  // 2. S3: https://bucket.s3.region.amazonaws.com/ig-posts
  // 3. ngrok (testing): https://xxx.ngrok.io/ig-posts
  // Set IG_IMAGE_BASE_URL in .env.secrets to override
  imageBaseUrl: loadEnvSafe().IG_IMAGE_BASE_URL || 'http://100.105.60.33:3000/ig-posts'
};

// Safe env loader for PATHS initialization
function loadEnvSafe() {
  try {
    const envPath = `${__dirname}/.env.secrets`;
    if (!existsSync(envPath)) return {};
    const content = readFileSync(envPath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      if (line.startsWith('#') || !line.includes('=')) continue;
      const [key, ...valueParts] = line.split('=');
      env[key.trim()] = valueParts.join('=').trim();
    }
    return env;
  } catch {
    return {};
  }
}
