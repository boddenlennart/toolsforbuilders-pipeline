#!/usr/bin/env node
/**
 * approval.mjs — Telegram approval flow for daily crosspost pipeline.
 *
 * Uses FILE-BASED signaling instead of getUpdates polling.
 * OpenClaw is already polling Telegram — using getUpdates here causes conflicts.
 *
 * Flow:
 *   1. Script sends Telegram message with Approve/Reject buttons
 *   2. Writes pending state to instagram/data/approvals/approval-{id}.json
 *   3. Polls the file every 15 seconds for up to 2 hours
 *   4. When Lennart clicks a button, OpenClaw (main session) receives the callback
 *      and writes {decision: "approved"|"rejected"} to the file
 *   5. Script reads the decision and proceeds
 *
 * OpenClaw AGENTS.md contains instructions to handle these callbacks automatically.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lazy config loading — avoid crashing at import time if config is missing
let _cachedBotToken = null;

function getTelegramBotToken() {
  if (_cachedBotToken) return _cachedBotToken;
  const configPath = '/root/.openclaw/openclaw.json';
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    _cachedBotToken = config?.channels?.telegram?.botToken;
    if (!_cachedBotToken) throw new Error('Telegram bot token not found in OpenClaw config');
    return _cachedBotToken;
  } catch (err) {
    throw new Error(`Failed to load OpenClaw config: ${err.message}`);
  }
}

const TG_CHAT_ID = '-1003879867373';
const TG_TOPIC_ID = 3;

function getTelegramApiUrl() {
  return `https://api.telegram.org/bot${getTelegramBotToken()}`;
}

// Persistent location for approval files (survives reboots)
const APPROVALS_DIR = join(__dirname, 'instagram/data/approvals');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureApprovalsDir() {
  if (!existsSync(APPROVALS_DIR)) {
    mkdirSync(APPROVALS_DIR, { recursive: true });
  }
}

function getApprovalFilePath(approvalId) {
  ensureApprovalsDir();
  return join(APPROVALS_DIR, `approval-${approvalId}.json`);
}

async function sendApprovalMessage(videoUrl, caption, approvalId) {
  const messageText =
    `📋 *Daily Crosspost — Approval Required*\n\n` +
    `🎬 [Watch video](${videoUrl})\n\n` +
    `📝 *Caption:*\n${caption}\n\n` +
    `_Approve or reject within 2 hours. No response = skip today._`;

  const payload = {
    chat_id: TG_CHAT_ID,
    message_thread_id: TG_TOPIC_ID,
    text: messageText,
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve_${approvalId}` },
        { text: '❌ Reject',  callback_data: `reject_${approvalId}` }
      ]]
    }
  };

  const res = await fetch(`${getTelegramApiUrl()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
  console.log(`✅ Approval request sent (message_id: ${data.result.message_id})`);
  return data.result.message_id;
}

/**
 * Poll the approval signal file every 15 seconds for up to 2 hours.
 * OpenClaw writes {decision: "approved"|"rejected"} to the file when Lennart clicks.
 */
async function pollApprovalFile(approvalId, timeoutMs = 2 * 60 * 60 * 1000) {
  const filePath = getApprovalFilePath(approvalId);
  const startTime = Date.now();
  const POLL_INTERVAL = 15_000; // 15 seconds

  // Write initial pending state
  writeFileSync(filePath, JSON.stringify({ status: 'pending', approvalId, createdAt: new Date().toISOString() }));

  console.log(`👀 Waiting for approval decision (file: ${filePath}, timeout: 2h)...`);
  let warned90 = false;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(POLL_INTERVAL);

    // 90-minute warning
    if (!warned90 && Date.now() - startTime >= 90 * 60 * 1000) {
      warned90 = true;
      try {
        await fetch(`${getTelegramApiUrl()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            message_thread_id: TG_TOPIC_ID,
            text: `⏰ *Approval reminder* — 30 minutes left before today's crosspost is skipped.`,
            parse_mode: 'Markdown',
          }),
        });
      } catch {}
    }

    if (!existsSync(filePath)) continue;

    try {
      const state = JSON.parse(readFileSync(filePath, 'utf8'));
      if (state.decision === 'approved') {
        console.log('✅ Approved by Lennart.');
        return 'approved';
      }
      if (state.decision === 'rejected') {
        console.log('❌ Rejected by Lennart.');
        return 'rejected';
      }
    } catch { /* file may be mid-write, retry next cycle */ }
  }

  console.log('⏰ Approval timeout — no response in 2 hours.');
  return 'timeout';
}

/**
 * Main exported function.
 * @param {string} videoUrl - R2 video URL
 * @param {string} caption  - Proposed post caption
 * @returns {boolean} true if approved, false otherwise
 */
export async function requestApproval(videoUrl, caption) {
  const approvalId = `crosspost_${Date.now()}`;
  console.log(`\n📤 Sending approval request (ID: ${approvalId})...`);

  try {
    await sendApprovalMessage(videoUrl, caption, approvalId);
  } catch (err) {
    console.error('❌ Failed to send approval message:', err.message);
    return false; // safe default: don't post without approval
  }

  const result = await pollApprovalFile(approvalId);
  return result === 'approved';
}

/**
 * Write a decision to the approval file.
 * Called by OpenClaw when Lennart clicks Approve/Reject.
 * Usage: node approval.mjs --decide crosspost_1234567890 approved
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, flag, approvalId, decision] = process.argv;
  if (flag === '--decide' && approvalId && decision) {
    const filePath = getApprovalFilePath(approvalId);
    writeFileSync(filePath, JSON.stringify({ decision, approvalId, decidedAt: new Date().toISOString() }));
    console.log(`✅ Decision written: ${decision} → ${filePath}`);
  } else {
    console.log('Usage: node approval.mjs --decide <approvalId> <approved|rejected>');
  }
}
