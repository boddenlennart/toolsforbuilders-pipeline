#!/usr/bin/env node
/**
 * Failure alert system for automation stack.
 * Exports sendAlert(message) function.
 * Sends Telegram message via Telegram Bot API directly, falls back to local log.
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TG_CHAT_ID = '-1003879867373';
const TG_TOPIC_ID = 3;

/** Load bot token from OpenClaw config — lazy, called inside sendAlert */
function loadBotToken() {
  if (process.env.TG_BOT_TOKEN) return process.env.TG_BOT_TOKEN;
  try {
    const config = JSON.parse(readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
    return config?.channels?.telegram?.botToken || null;
  } catch {
    return null;
  }
}

const LOG_DIR = join(__dirname, 'logs');
const LOG_FILE = join(LOG_DIR, 'alerts.log');

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Send alert via Telegram Bot API (preferred) or fallback to log file.
 * @param {string} message - Alert message.
 * @returns {Promise<boolean>} - True if sent successfully via Telegram.
 */
export async function sendAlert(message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;

  // Lazy-load token — never throws at import time
  const TG_BOT_TOKEN = loadBotToken();
  if (!TG_BOT_TOKEN) {
    console.warn('⚠️ No Telegram bot token configured — logging alert to file only');
    try {
      ensureLogDir();
      appendFileSync(LOG_FILE, formatted + '\n', 'utf8');
    } catch {}
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        message_thread_id: TG_TOPIC_ID,
        text: `🚨 *Alert*\n\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
    
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || 'Telegram API error');
    }
    
    console.log(`✅ Alert sent via Telegram: ${message}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Telegram alert failed: ${error.message}`);
    // Fallback to log file
    try {
      ensureLogDir();
      appendFileSync(LOG_FILE, formatted + '\n', 'utf8');
      console.log(`📝 Alert logged to file: ${LOG_FILE}`);
      return false;
    } catch (logError) {
      console.error(`❌ Both Telegram and log file failed: ${logError.message}`);
      return false;
    }
  }
}

// For testing: if called directly, send a test alert
if (import.meta.url === `file://${process.argv[1]}`) {
  const testMsg = process.argv[2] || 'Test alert from alert.mjs';
  sendAlert(testMsg);
}