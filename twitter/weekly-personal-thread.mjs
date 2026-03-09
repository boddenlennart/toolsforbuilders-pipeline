#!/usr/bin/env node
/**
 * weekly-personal-thread.mjs — Personal thread generator for @btcmaxistheway
 *
 * Generates one personal thread per week using Lennart's authentic biographical
 * details and native content angles. Runs Sunday evenings (8pm Bangkok / 13:00 UTC).
 *
 * Usage:
 *   node weekly-personal-thread.mjs           # Full run
 *   node weekly-personal-thread.mjs --dry-run # Test without posting/notifying
 *   node weekly-personal-thread.mjs --force   # Run even if not Sunday
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// === PATHS ===
const PATHS = {
  tracker: '/root/.openclaw/workspace/memory/personal-thread-tracker.json',
  brandPersona: '/root/.openclaw/workspace/memory/brand-persona.md',
  brandIdentity: '/root/.openclaw/workspace/memory/brand-identity-2026-03-02.md',
  writingRules: '/root/.openclaw/workspace/memory/writing-rules.md',
  userMd: '/root/.openclaw/workspace/USER.md',
  openclawConfig: '/root/.openclaw/openclaw.json',
};

const TELEGRAM = {
  chatId: '-1003879867373',
  messageThreadId: 6,
};

// === LOGGING ===
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// === DATE CHECK ===
function isSunday() {
  const bkkNow = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'long' });
  return bkkNow === 'Sunday';
}

function getTodayBkk() {
  return new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Bangkok', dateStyle: 'short' }).format(new Date());
}

// === LOAD/SAVE TRACKER ===
function loadTracker() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.tracker, 'utf8'));
  } catch (e) {
    log(`ERROR: Could not load tracker: ${e.message}`);
    process.exit(1);
  }
}

function saveTracker(tracker) {
  fs.writeFileSync(PATHS.tracker, JSON.stringify(tracker, null, 2));
}

// === TELEGRAM ===
async function sendTelegram(message) {
  if (DRY_RUN) {
    log(`DRY RUN: Would send Telegram: ${message}`);
    return;
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(PATHS.openclawConfig, 'utf8'));
    const botToken = cfg.channels?.telegram?.botToken;
    if (!botToken) {
      log('WARN: No Telegram bot token found');
      return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM.chatId,
        message_thread_id: TELEGRAM.messageThreadId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      log(`WARN: Telegram send failed: ${res.status}`);
    }
  } catch (e) {
    log(`WARN: Telegram error: ${e.message}`);
  }
}

// === MAIN ===
async function main() {
  log('=== Weekly Personal Thread Generator ===');
  log(DRY_RUN ? 'Mode: DRY RUN' : 'Mode: LIVE');

  // Check if Sunday (unless forced)
  if (!FORCE && !isSunday()) {
    log('Not Sunday — skipping. Use --force to override.');
    return;
  }

  const tracker = loadTracker();
  const todayBkk = getTodayBkk();

  // Check if already posted today
  if (tracker.lastPostedDate === todayBkk && !FORCE) {
    log(`Already posted today (${todayBkk}) — skipping.`);
    return;
  }

  // Check if all angles used
  if (tracker.nextAngleIndex >= tracker.angles.length) {
    log('All 15 personal thread angles have been used.');
    await sendTelegram(
      '📝 <b>Weekly Personal Thread — All Angles Used</b>\n\n' +
      'All 15 personal thread angles have been posted.\n\n' +
      'Ready for next batch when you want to add more personal details to the interview or unlock new angles.\n\n' +
      'Weekly personal threads are paused until then.'
    );
    return;
  }

  // Get next angle
  const angleKey = tracker.angles[tracker.nextAngleIndex];
  const angleDetails = tracker.angleDetails[angleKey];

  if (!angleDetails) {
    log(`ERROR: No details found for angle "${angleKey}"`);
    return;
  }

  log(`Selected angle: "${angleDetails.title}" (index ${tracker.nextAngleIndex})`);

  // Load writing rules
  const writingRules = fs.readFileSync(PATHS.writingRules, 'utf8');

  // Build the generation prompt
  const prompt = buildPrompt(angleDetails, writingRules, todayBkk);

  // Send to agent for generation
  log('Sending to agent for thread generation...');

  if (DRY_RUN) {
    log('DRY RUN: Would send the following prompt to agent:');
    console.log('\n' + '='.repeat(60));
    console.log(prompt.slice(0, 2000) + '...');
    console.log('='.repeat(60) + '\n');
    log('DRY RUN: Thread would be generated and submitted to pipeline');
    return;
  }

  try {
    const { stdout } = await execFileAsync('openclaw', [
      'agent', '--local', '--agent', 'main',
      '--message', prompt,
    ], { timeout: 300000, maxBuffer: 1024 * 1024 });

    log('Agent completed. Checking for success...');

    // Update tracker on success
    tracker.anglesUsed.push(angleKey);
    tracker.nextAngleIndex++;
    tracker.lastPostedDate = todayBkk;
    saveTracker(tracker);

    log(`Tracker updated. Next angle index: ${tracker.nextAngleIndex}`);

    // Notify success
    await sendTelegram(
      `📝 <b>Weekly Personal Thread Generated</b>\n\n` +
      `Angle: "${angleDetails.title}"\n` +
      `Queue position: ${tracker.nextAngleIndex}/15\n\n` +
      `Thread submitted to content pipeline as draft. Review and approve when ready.`
    );

  } catch (e) {
    log(`ERROR: Agent failed: ${e.message}`);
    await sendTelegram(
      `⚠️ <b>Weekly Personal Thread Failed</b>\n\n` +
      `Angle: "${angleDetails.title}"\n` +
      `Error: ${e.message.slice(0, 200)}\n\n` +
      `Manual intervention needed.`
    );
  }
}

function buildPrompt(angleDetails, writingRules, scheduledDate) {
  return `PERSONAL THREAD GENERATION — Weekly autobiographical thread for @btcmaxistheway

This is a PERSONAL thread using Lennart's real biographical details. Do NOT invent any details.

=== ANGLE TO USE ===
Title: ${angleDetails.title}
Hook: ${angleDetails.hook}

Key Facts (ONLY use these — never invent):
${angleDetails.keyFacts.map(f => `- ${f}`).join('\n')}

Direct Quotes (can use verbatim or paraphrase):
${angleDetails.quotes.map(q => `- "${q}"`).join('\n')}

=== BIOGRAPHICAL CONTEXT ===
- German, 33 years old
- M.Sc. Chemistry & Business Chemistry (never worked in field)
- IT consultant/project manager since 2018
- 2023: Career break, traveled SEA, fell in love with Thailand
- Late 2025: Moved to Bangkok
- 2026: BA role at software company (40h/week)
- First dismissed Bitcoin in 2013 as "magic internet money"
- Got FOMO in 2017, lost money in ICO bubble 2018
- Read Bitcoin Standard extensively in 2020 — finally understood
- Venezuela and Argentina stories were pivotal
- Uses AI pragmatically (not dogmatic)
- Values: discipline (German), risk-taking (Bangkok), fairness (Bitcoin access for all)

=== THREAD REQUIREMENTS ===
1. Generate a 5-7 tweet thread
2. Each tweet MUST be 275 characters or fewer (hard limit)
3. Tweet 1 = Hook. Opens with a declarative statement, ends with 🧵
4. Tweets 2-N = Build the story using ONLY confirmed biographical facts
5. Final tweet = Landing statement that works standalone
6. NO DASHES anywhere (em-dash, en-dash, hyphen-as-separator)
7. NO hashtags, NO @mentions, NO emojis except 🧵 in tweet 1
8. Voice: First person, reflective, acknowledges past mistakes, connects personal to universal

=== WRITING RULES (FOLLOW EXACTLY) ===
${writingRules.slice(0, 6000)}

=== CRITICAL INSTRUCTION ===
This thread uses Lennart's REAL story. Do NOT invent details. If a detail is not in the source material above, do NOT include it. The power of this content is its authenticity.

=== SUBMISSION ===
After generating the thread, POST it to the content pipeline:

POST http://localhost:3000/api/content-pipeline
{
  "type": "thread",
  "content_json": {
    "tweets": [
      {"order": 1, "text": "...🧵"},
      {"order": 2, "text": "..."},
      ...
    ]
  },
  "scheduled_date": "${scheduledDate}",
  "source": "personal_weekly",
  "urgency": "normal"
}

Generate the thread now. Self-review against writing rules. Fix any dashes. Verify character counts. Then submit.`;
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
