#!/usr/bin/env node
/**
 * submit-draft.mjs — Add AI-drafted content to the Content Pipeline
 * 
 * Usage:
 *   node submit-draft.mjs --type thread --content "Tweet 1|Tweet 2|Tweet 3" --date 2026-02-28
 *   node submit-draft.mjs --type reply --target @dergigi --content "Great point!"
 *   node submit-draft.mjs --type retweet --target @dergigi --comment "Exactly!"
 *   node submit-draft.mjs --type essay --title "My Essay" --body "Full text..."
 * 
 * This script is used by Skynet to add AI-generated content drafts to the pipeline
 * for Lennart to review and approve before posting.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load server URL from .env or default to localhost:3000
function getServerUrl() {
  try {
    const envPath = join(__dirname, '.env.secrets');
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/LIFEDASH_URL=(.+)/);
    if (match) return match[1].trim();
  } catch (_) {}
  return 'http://localhost:3000';
}

const SERVER_URL = getServerUrl();

// Parse CLI args
const args = process.argv.slice(2);
const params = {
  type: 'thread',
  content: '',
  target: null,
  date: null,
  title: null,
  body: null,
  comment: null,
  urgency: 'normal',
  source: null,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  
  if (arg === '--type' && next) {
    params.type = next;
    i++;
  } else if (arg === '--content' && next) {
    params.content = next;
    i++;
  } else if (arg === '--target' && next) {
    params.target = next;
    i++;
  } else if (arg === '--date' && next) {
    params.date = next;
    i++;
  } else if (arg === '--title' && next) {
    params.title = next;
    i++;
  } else if (arg === '--body' && next) {
    params.body = next;
    i++;
  } else if (arg === '--comment' && next) {
    params.comment = next;
    i++;
  } else if (arg === '--urgency' && next) {
    params.urgency = next;
    i++;
  } else if (arg === '--source' && next) {
    params.source = next;
    i++;
  }
}

// Validate
if (!['thread', 'reply', 'retweet', 'essay'].includes(params.type)) {
  console.error('Error: --type must be thread, reply, retweet, or essay');
  process.exit(1);
}

if (!['low', 'normal', 'high'].includes(params.urgency)) {
  console.error('Error: --urgency must be low, normal, or high');
  process.exit(1);
}

// Build content_json based on type
let contentJson = {};

switch (params.type) {
  case 'thread':
    if (!params.content) {
      console.error('Error: --content required for threads (pipe-separated tweets)');
      process.exit(1);
    }
    contentJson.tweets = params.content.split('|').map((text, i) => ({
      text: text.trim(),
      order: i + 1
    }));
    break;
    
  case 'reply':
    if (!params.content) {
      console.error('Error: --content required for replies');
      process.exit(1);
    }
    contentJson.text = params.content;
    break;
    
  case 'retweet':
    if (!params.comment) {
      console.error('Error: --comment required for retweets');
      process.exit(1);
    }
    contentJson.comment = params.comment;
    break;
    
  case 'essay':
    if (!params.title || !params.body) {
      console.error('Error: --title and --body required for essays');
      process.exit(1);
    }
    contentJson.title = params.title;
    contentJson.body = params.body;
    break;
}

// Default to today if no date provided
const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Bangkok' });
const scheduledDate = params.date || today;

// Build request
const payload = {
  type: params.type,
  scheduled_date: scheduledDate,
  content_json: contentJson,
  target_account: params.target,
  urgency: params.urgency,
  source: params.source,
};

async function main() {
  console.log(`Submitting to Content Pipeline...`);
  console.log(`  Type: ${params.type}`);
  console.log(`  Date: ${scheduledDate}`);
  console.log(`  Target: ${params.target || '(none)'}`);
  console.log(`  Urgency: ${params.urgency}`);
  console.log(`  Source: ${params.source || '(none)'}`);
  
  try {
    const res = await fetch(`${SERVER_URL}/api/content-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      console.error(`Error: ${res.status} - ${data.error || 'Unknown error'}`);
      process.exit(1);
    }
    
    console.log(`\n✅ Draft added successfully!`);
    console.log(`   ID: ${data.item.id}`);
    console.log(`   Status: ${data.item.status}`);
    console.log(`   Scheduled: ${data.item.scheduled_date}`);
    console.log(`\n🔗 View in dashboard: ${SERVER_URL}/#pipeline`);
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
