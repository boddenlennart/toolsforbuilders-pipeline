#!/usr/bin/env node
/**
 * check-uptime-kuma.mjs — Heartbeat system health checker.
 *
 * Queries Uptime Kuma's SQLite DB directly, checks for DOWN monitors,
 * then auto-remediates or alerts Lennart per monitor type.
 *
 * Monitor action table:
 *   Life Dashboard (HTTP/HTTPS)  → pm2 restart life-dash → verify → alert if still down
 *   Health Webhook               → pm2 restart health-webhook → verify → alert if fails
 *   OpenClaw Gateway             → openclaw gateway restart → verify → alert if fails
 *   Daily Crosspost (IG/YT/TikTok) → read log, alert
 *   Weekly Content Research      → read log, alert
 *   IG Token Refresh             → urgent alert
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sendAlert } from './alert.mjs';

const HEARTBEAT_STATE = '/root/.openclaw/workspace/memory/heartbeat-state.json';
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours between repeat alerts for same monitor

function loadState() {
  if (!existsSync(HEARTBEAT_STATE)) return {};
  try { return JSON.parse(readFileSync(HEARTBEAT_STATE, 'utf8')); }
  catch { return {}; }
}

function saveState(state) {
  writeFileSync(HEARTBEAT_STATE, JSON.stringify(state, null, 2));
}

function shouldAlert(state, monitorName) {
  const lastAlerts = state.kumaAlerts || {};
  const last = lastAlerts[monitorName];
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) > ALERT_COOLDOWN_MS;
}

function markAlerted(state, monitorName) {
  if (!state.kumaAlerts) state.kumaAlerts = {};
  state.kumaAlerts[monitorName] = new Date().toISOString();
}

function clearAlert(state, monitorName) {
  if (state.kumaAlerts?.[monitorName]) {
    delete state.kumaAlerts[monitorName];
  }
}

const KUMA_DB = '/root/uptime-kuma/data/kuma.db';
const LOG_DIR = '/root/.openclaw/workspace/scripts/logs';
const CROSSPOST_LOG = '/tmp/daily-crosspost.log';

// ─── DB query ────────────────────────────────────────────────────────────────

function getMonitorStatuses() {
  const py = `
import sqlite3, json, sys
conn = sqlite3.connect('${KUMA_DB}')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("""
  SELECT m.id, m.name, m.type, m.active,
         h.status, h.msg, h.time
  FROM monitor m
  LEFT JOIN heartbeat h ON h.monitor_id = m.id
    AND h.time = (SELECT MAX(time) FROM heartbeat WHERE monitor_id = m.id)
  WHERE m.active = 1
  ORDER BY m.name
""")
rows = cur.fetchall()
print(json.dumps([dict(r) for r in rows]))
conn.close()
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`DB query failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
}

// ─── Remediation helpers ─────────────────────────────────────────────────────

function pm2Restart(pm2Name) {
  const r = spawnSync('pm2', ['restart', pm2Name], { encoding: 'utf8' });
  return r.status === 0;
}

function pm2IsOnline(pm2Name) {
  const r = spawnSync('pm2', ['jlist'], { encoding: 'utf8' });
  if (r.status !== 0) return false;
  try {
    const list = JSON.parse(r.stdout);
    const proc = list.find(p => p.name === pm2Name);
    return proc?.pm2_env?.status === 'online';
  } catch { return false; }
}

function gatewayRestart() {
  const r = spawnSync('openclaw', ['gateway', 'restart'], { encoding: 'utf8' });
  return r.status === 0;
}

function gatewayIsUp() {
  const r = spawnSync('openclaw', ['gateway', 'status'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.includes('running');
}

function readLog(path, lines = 20) {
  if (!existsSync(path)) return `(log not found: ${path})`;
  const content = readFileSync(path, 'utf8').trim();
  const split = content.split('\n');
  // Strip ANSI codes and Telegram Markdown v1 special chars (* _ ` [)
  return split.slice(-lines).join('\n')
    .replace(/\x1b\[[0-9;]*m/g, '')  // ANSI escape codes
    .replace(/[_*`[\]]/g, '');        // Telegram Markdown v1 specials
}

function sanitize(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[_*`[\]]/g, '');
}

// ─── Monitor action map ───────────────────────────────────────────────────────

async function handleDown(monitor, state) {
  const name = monitor.name;
  const msg = monitor.msg || '(no message)';
  const lastTime = monitor.time || 'never';

  console.log(`⚠️  DOWN: ${name} — ${msg} (last: ${lastTime})`);

  // Auto-remediation monitors always run (pm2 restart is idempotent)
  // Alert-only monitors: skip if we already alerted within cooldown
  const alertOnly = !['Life Dashboard (HTTP)', 'Life Dashboard (HTTPS)', 'Health Webhook', 'OpenClaw Gateway'].includes(name);
  if (alertOnly && !shouldAlert(state, name)) {
    console.log(`   ⏭️  Alert suppressed (already alerted within ${ALERT_COOLDOWN_MS / 3600000}h cooldown)`);
    return;
  }

  if (name === 'Life Dashboard (HTTP)' || name === 'Life Dashboard (HTTPS)') {
    console.log('   → Auto-fix: pm2 restart life-dash');
    const restarted = pm2Restart('life-dash');
    if (!restarted) {
      await sendAlert(`🚨 Life Dashboard DOWN — pm2 restart failed. Manual intervention needed.`);
      return;
    }
    // Wait 5s then verify
    await sleep(5000);
    if (pm2IsOnline('life-dash')) {
      console.log('   ✅ life-dash back online after restart');
    } else {
      await sendAlert(`🚨 Life Dashboard still DOWN after pm2 restart. Check PM2 logs: pm2 logs life-dash`);
    }

  } else if (name === 'Health Webhook') {
    console.log('   → Auto-fix: pm2 restart health-webhook');
    const restarted = pm2Restart('health-webhook');
    if (!restarted) {
      await sendAlert(`🚨 Health Webhook DOWN — pm2 restart failed. Manual intervention needed.`);
      return;
    }
    await sleep(5000);
    if (pm2IsOnline('health-webhook')) {
      console.log('   ✅ health-webhook back online after restart');
    } else {
      await sendAlert(`🚨 Health Webhook still DOWN after pm2 restart. Check: pm2 logs health-webhook`);
    }

  } else if (name === 'OpenClaw Gateway') {
    console.log('   → Auto-fix: openclaw gateway restart');
    const restarted = gatewayRestart();
    if (!restarted) {
      await sendAlert(`🚨 OpenClaw Gateway DOWN — restart failed. Run: openclaw gateway restart`);
      return;
    }
    await sleep(5000);
    if (gatewayIsUp()) {
      console.log('   ✅ Gateway back online after restart');
    } else {
      await sendAlert(`🚨 OpenClaw Gateway still DOWN after restart attempt. Needs manual check.`);
    }

  } else if (name === 'Daily Crosspost (IG/YT/TikTok)') {
    // Push monitor — script didn't send heartbeat. Read log and surface.
    const tail = readLog(CROSSPOST_LOG);
    const latest = (() => {
      const r = spawnSync('ls', ['-1t', LOG_DIR], { encoding: 'utf8' });
      const files = r.stdout.trim().split('\n').filter(f => f.startsWith('crosspost-'));
      return files.length ? `${LOG_DIR}/${files[0]}` : null;
    })();
    const latestTail = latest ? readLog(latest, 10) : '(no log found)';
    markAlerted(state, name);
    await sendAlert(
      `⚠️ Daily Crosspost missed — Uptime Kuma shows DOWN.\n\n` +
      `Log tail:\n${tail}\n\nLatest crosspost log:\n${latestTail}`
    );

  } else if (name === 'Weekly Content Research') {
    const r = spawnSync('ls', ['-1t', LOG_DIR], { encoding: 'utf8' });
    const files = r.stdout.trim().split('\n').filter(f => f.startsWith('weekly-research-'));
    const logPath = files.length ? `${LOG_DIR}/${files[0]}` : null;
    const tail = logPath ? readLog(logPath, 15) : '(no log found)';
    markAlerted(state, name);
    await sendAlert(`⚠️ Weekly Content Research missed — Uptime Kuma shows DOWN.\n\nLog tail:\n${tail}`);

  } else if (name === 'IG Token Refresh') {
    markAlerted(state, name);
    await sendAlert(
      `🚨 URGENT: IG Token Refresh missed — monitor shows DOWN.\n` +
      `Instagram posting will break in 30 days if token expires.\n` +
      `Check: scripts/instagram/.env.secrets`
    );

  } else {
    // Unknown monitor
    markAlerted(state, name);
    await sendAlert(`⚠️ Unknown monitor DOWN: ${sanitize(name)} — ${sanitize(msg)}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadState();
  let monitors;
  try {
    monitors = getMonitorStatuses();
  } catch (err) {
    await sendAlert(`🚨 check-uptime-kuma: failed to query Kuma DB — ${err.message}`);
    process.exit(1);
  }

  const down = monitors.filter(m => m.status === 0);   // explicit DOWN
  const missing = monitors.filter(m => m.status === null); // never had heartbeat

  console.log(`📊 Uptime Kuma: ${monitors.length} monitors, ${down.length} DOWN, ${missing.length} no heartbeat`);

  if (down.length === 0) {
    console.log('✅ All active monitors UP');
    // Clear any alerts that were resolved
    const hadAlerts = Object.keys(state.kumaAlerts || {});
    if (hadAlerts.length > 0) {
      console.log(`📝 Clearing resolved alerts: ${hadAlerts.join(', ')}`);
      state.kumaAlerts = {};
      saveState(state);
    }
    process.exit(0);
  }

  for (const monitor of down) {
    await handleDown(monitor, state);
  }
  
  saveState(state);
}

main().catch(async (err) => {
  try { await sendAlert(`🚨 check-uptime-kuma crashed: ${err.message}`); } catch {}
  process.exit(1);
});
