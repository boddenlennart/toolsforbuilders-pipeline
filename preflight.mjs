#!/usr/bin/env node
/**
 * preflight.mjs — Pre-flight check for daily crosspost pipeline.
 * Validates tokens, queue state, file integrity before a post runs.
 *
 * Usage:
 *   node preflight.mjs           # Full preflight check
 *   node preflight.mjs --quiet   # Only output failures
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = critical failure (do not proceed)
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes('--quiet');

const PATHS = {
  queue: join(__dirname, 'instagram/data/content-queue.json'),
  archive: join(__dirname, 'instagram/data/archive/published.json'),
  perfLog: join(__dirname, 'instagram/data/performance-log.jsonl'),
  kbDir: join(__dirname, 'instagram/data/kb'),
  igSecrets: join(__dirname, 'instagram/.env.secrets'),
  ytToken: join(__dirname, 'youtube/youtube-token.json'),
};

const results = {
  passed: [],
  warnings: [],
  failures: [],
};

function log(msg) {
  if (!quiet) console.log(msg);
}

function pass(check) {
  results.passed.push(check);
  log(`✅ ${check}`);
}

function warn(check, detail = '') {
  results.warnings.push({ check, detail });
  console.log(`⚠️  ${check}${detail ? ': ' + detail : ''}`);
}

function fail(check, detail = '') {
  results.failures.push({ check, detail });
  console.log(`❌ ${check}${detail ? ': ' + detail : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

function checkYouTubeToken() {
  if (!existsSync(PATHS.ytToken)) {
    fail('YouTube token', 'youtube-token.json not found');
    return;
  }
  try {
    const token = JSON.parse(readFileSync(PATHS.ytToken, 'utf8'));
    const now = Date.now();
    const expiryMs = token.expiry_date || token.expires_at;
    
    if (!expiryMs) {
      warn('YouTube token', 'No expiry_date field — cannot verify token validity');
      return;
    }
    
    if (expiryMs < now) {
      fail('YouTube token', `Expired ${Math.floor((now - expiryMs) / 1000 / 60)} minutes ago`);
    } else if (expiryMs < now + 10 * 60 * 1000) {
      warn('YouTube token', 'Expires in less than 10 minutes — may refresh during upload');
    } else {
      pass('YouTube token valid');
    }
  } catch (e) {
    fail('YouTube token', `Parse error: ${e.message}`);
  }
}

async function checkInstagramToken() {
  if (!existsSync(PATHS.igSecrets)) {
    fail('Instagram token', '.env.secrets not found');
    return;
  }
  
  try {
    const env = {};
    const lines = readFileSync(PATHS.igSecrets, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    
    const token = env.IG_ACCESS_TOKEN;
    const userId = env.IG_USER_ID;
    
    if (!token) {
      fail('Instagram token', 'IG_ACCESS_TOKEN not found in .env.secrets');
      return;
    }
    if (!userId) {
      warn('Instagram token', 'IG_USER_ID not found — API calls may fail');
    }
    
    // Ping IG API to verify token
    const url = `https://graph.facebook.com/v22.0/me?access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.error) {
      if (data.error.code === 190) {
        fail('Instagram token', 'Token is invalid or expired');
      } else {
        fail('Instagram token', data.error.message);
      }
      return;
    }
    
    // Check token expiry via debug_token endpoint
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();
    
    if (debugData.data?.expires_at) {
      const expiryMs = debugData.data.expires_at * 1000;
      const now = Date.now();
      const daysLeft = Math.floor((expiryMs - now) / 1000 / 60 / 60 / 24);
      
      if (daysLeft < 0) {
        fail('Instagram token', 'Token is expired');
      } else if (daysLeft < 7) {
        warn('Instagram token', `Expires in ${daysLeft} days — refresh soon`);
      } else {
        pass(`Instagram token valid (${daysLeft} days remaining)`);
      }
    } else {
      pass('Instagram token valid (expiry unknown — likely long-lived)');
    }
  } catch (e) {
    fail('Instagram token', `Validation error: ${e.message}`);
  }
}

function checkContentQueue() {
  if (!existsSync(PATHS.queue)) {
    fail('Content queue', 'content-queue.json not found');
    return;
  }
  
  try {
    const queue = JSON.parse(readFileSync(PATHS.queue, 'utf8'));
    const available = queue.posts?.filter(p => p.status === 'queued' || p.status === 'needs-review') || [];
    
    if (available.length === 0) {
      fail('Content queue', 'No queued or needs-review scripts available');
    } else if (available.length <= 2) {
      warn('Content queue', `Only ${available.length} script(s) remaining`);
    } else {
      pass(`Content queue has ${available.length} scripts ready`);
    }
  } catch (e) {
    fail('Content queue', `Parse error: ${e.message}`);
  }
}

function checkRequiredFiles() {
  const files = [
    { path: PATHS.queue, name: 'content-queue.json', required: true },
    { path: PATHS.archive, name: 'archive/published.json', required: false },
    { path: PATHS.perfLog, name: 'performance-log.jsonl', required: false },
    { path: PATHS.kbDir, name: 'knowledge base directory', required: false },
  ];
  
  for (const file of files) {
    if (existsSync(file.path)) {
      pass(`File exists: ${file.name}`);
    } else if (file.required) {
      fail(`Required file missing: ${file.name}`);
    } else {
      warn(`Optional file missing: ${file.name}`);
    }
  }
}

async function checkImportChain() {
  const modules = [
    { path: './instagram/post-to-instagram.mjs', exports: ['postToInstagram'] },
    { path: './youtube/upload-to-youtube.mjs', exports: ['uploadToYouTube'] },
    { path: './instagram/upload-to-r2.mjs', exports: ['uploadToR2'] },
    { path: './alert.mjs', exports: ['sendAlert'] },
    { path: './approval.mjs', exports: ['requestApproval'] },
    { path: './instagram/quality-gate.mjs', exports: ['checkQuality'] },
  ];
  
  for (const mod of modules) {
    try {
      const imported = await import(mod.path);
      const missing = mod.exports.filter(exp => typeof imported[exp] !== 'function');
      
      if (missing.length > 0) {
        fail(`Import: ${mod.path}`, `Missing exports: ${missing.join(', ')}`);
      } else {
        pass(`Import: ${mod.path}`);
      }
    } catch (e) {
      fail(`Import: ${mod.path}`, e.message);
    }
  }
}

async function runParityCheck() {
  try {
    // Try to import parity test functions if available
    const parityTestPath = join(__dirname, 'tests/parity.test.mjs');
    if (!existsSync(parityTestPath)) {
      warn('Parity test', 'tests/parity.test.mjs not found — skipping');
      return;
    }
    
    const { runParityCheck: parity } = await import('./tests/parity.test.mjs');
    if (typeof parity === 'function') {
      const result = await parity();
      if (result.passed) {
        pass('Parity check passed');
      } else {
        fail('Parity check', result.failures?.join(', ') || 'Unknown failure');
      }
    } else {
      warn('Parity test', 'runParityCheck function not exported');
    }
  } catch (e) {
    warn('Parity test', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('🛫 Preflight Check — @toolsforbuilders Pipeline');
  console.log(`🕐 ${new Date().toISOString()}`);
  console.log('═'.repeat(60));
  console.log('');
  
  // Run all checks
  checkYouTubeToken();
  await checkInstagramToken();
  checkContentQueue();
  checkRequiredFiles();
  await checkImportChain();
  await runParityCheck();
  
  // Summary
  console.log('');
  console.log('─'.repeat(60));
  console.log('📊 Summary');
  console.log(`   ✅ Passed:   ${results.passed.length}`);
  console.log(`   ⚠️  Warnings: ${results.warnings.length}`);
  console.log(`   ❌ Failures: ${results.failures.length}`);
  console.log('─'.repeat(60));
  
  if (results.failures.length > 0) {
    console.log('');
    console.log('❌ PREFLIGHT FAILED — do not proceed');
    console.log('   Fix the following issues:');
    for (const f of results.failures) {
      console.log(`   • ${f.check}: ${f.detail}`);
    }
    process.exit(1);
  } else if (results.warnings.length > 0) {
    console.log('');
    console.log('⚠️  PREFLIGHT PASSED WITH WARNINGS');
    process.exit(0);
  } else {
    console.log('');
    console.log('✅ PREFLIGHT PASSED — all systems go');
    process.exit(0);
  }
}

// Export for use as module
export { results as preflightResults };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('🔥 Preflight crashed:', err);
    process.exit(1);
  });
}
