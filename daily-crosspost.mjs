#!/usr/bin/env node
/**
 * daily-crosspost.mjs — Orchestrator for daily cross-posting pipeline.
 * 1. Generate Reel using generate-reel-v2.mjs
 * 2. Upload MP4 to R2 (for TikTok PULL_FROM_URL)
 * 3. Post to Instagram using existing logic
 * 4. Upload to YouTube Shorts
 * 5. Upload to TikTok
 * Logs results, continues on platform failures.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { requestApproval } from './approval.mjs';
import { sendAlert } from './alert.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url)); // must be before any join(__dirname, ...)

/** DRYRUN mode — run all preparation logic but skip actual API calls */
const DRYRUN = process.env.DRYRUN === '1';
if (DRYRUN) console.log('🔍 DRY RUN MODE — no actual API calls will be made\n');

/** Load OpenClaw config (bot token etc.) from the main config file. */
const loadOpenClawConfig = () => JSON.parse(readFileSync('/root/.openclaw/openclaw.json', 'utf8'));

const QUEUE_PATH = join(__dirname, 'instagram/data/content-queue.json');
const ARCHIVE_PATH = join(__dirname, 'instagram/data/archive/published.json');

/**
 * Pick the next queued script from content-queue.json.
 * Returns { script, index } or null if queue is empty.
 */
function pickNextScript() {
  if (!existsSync(QUEUE_PATH)) return null;
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  const idx = queue.posts.findIndex(p => p.status === 'queued' || p.status === 'needs-review');
  if (idx === -1) return null;
  return { script: queue.posts[idx], index: idx };
}

/**
 * Write the picked script to a temp file for the generator.
 * Returns the temp file path.
 */
function writeScriptTemp(script) {
  const tmpPath = join(__dirname, 'instagram/data/tmp/current-script.json');
  mkdirSync(dirname(tmpPath), { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(script, null, 2));
  return tmpPath;
}

/**
 * Mark a script as used in the queue and append to published archive.
 */
function markScriptUsed(script, index, postResults) {
  // Update queue status
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  queue.posts[index].status = 'used';
  queue.posts[index].usedAt = new Date().toISOString();
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

  // Append to archive
  mkdirSync(dirname(ARCHIVE_PATH), { recursive: true });
  const archiveRaw = existsSync(ARCHIVE_PATH)
    ? JSON.parse(readFileSync(ARCHIVE_PATH, 'utf8'))
    : { published: [] };
  // Normalize legacy 'posts' key to 'published'
  const archive = archiveRaw.published ? archiveRaw : { published: archiveRaw.posts || [] };
  archive.published.push({
    id: script.id,
    pillar: script.pillar,
    topic: script.topic,
    hookHeadline: script.hookHeadline || null,
    postedAt: new Date().toISOString(),
    platforms: postResults,
  });
  writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  console.log(`📦 Marked "${script.id}" as used. Archive updated.`);

  // Append to performance log for future analytics
  // Note: Performance log now only tracks post metadata; metrics are pulled separately by analytics-pull.mjs
  const perfLogPath = join(__dirname, 'instagram/data/performance-log.jsonl');
  const perfEntry = {
    ts: new Date().toISOString(),
    scriptId: script.id,
    pillar: script.pillar,
    topic: script.topic,
    hookHeadline: script.hookHeadline || script.topic,
    postedAt: new Date().toISOString(),
    igMediaId: postResults.instagram?.mediaId || null,
    ytVideoId: postResults.youtube?.videoId || null,
    tiktokManual: postResults.tiktok?.manual || false,
    // Metrics fields (populated by analytics-pull.mjs later)
    metricsCollectedAt: null,
    daysAfterPost: null,
    instagram: null,
    youtube: null,
    tiktok: null,
  };
  try {
    appendFileSync(perfLogPath, JSON.stringify(perfEntry) + '\n');
    console.log(`📊 Performance log appended: ${perfLogPath}`);
  } catch (e) {
    console.warn(`⚠️ Performance log failed: ${e.message}`);
  }
}

/**
 * Alert if queue is running low (≤ 2 scripts remaining).
 */
function checkQueueHealth() {
  if (!existsSync(QUEUE_PATH)) return;
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  const remaining = queue.posts.filter(p => p.status === 'queued' || p.status === 'needs-review').length;
  if (remaining <= 2) {
    sendAlert(`⚠️ Content queue running low — only ${remaining} script(s) left. Weekly research runs Sunday 20:00 UTC.`)
      .catch(err => console.warn('⚠️ Queue health alert failed:', err.message));
  }
  return remaining;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Extract YouTube video ID from URL or youtu.be link.
 * Handles: https://youtu.be/VIDEO_ID, https://youtube.com/watch?v=VIDEO_ID
 */
function extractYouTubeVideoId(url) {
  if (!url) return null;
  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) return shortMatch[1];
  // youtube.com/watch?v=VIDEO_ID
  const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (longMatch) return longMatch[1];
  return null;
}

/**
 * Verify R2 URL is publicly accessible with retries.
 * @param {string} url - R2 public URL
 * @param {number} maxRetries - Number of retries (default 3)
 * @param {number} delayMs - Delay between retries in ms (default 2000)
 * @returns {Promise<void>} - Throws if URL not accessible after retries
 */
async function verifyR2Url(url, maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        console.log(`✅ R2 URL verified accessible (attempt ${attempt}): ${url}`);
        return;
      }
      console.warn(`⚠️ R2 URL returned ${response.status} (attempt ${attempt}/${maxRetries})`);
    } catch (err) {
      console.warn(`⚠️ R2 URL fetch failed (attempt ${attempt}/${maxRetries}): ${err.message}`);
    }
    if (attempt < maxRetries) {
      await sleep(delayMs);
    }
  }
  throw new Error(`R2 URL not accessible after ${maxRetries} retries: ${url}`);
}

/**
 * Run a shell command and capture stdout/stderr.
 */
async function exec(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());
    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed ${code}: ${stderr}`));
    });
  });
}

/**
 * Parse generated reel path from generate-reel-v2 output.
 * Expects line: "✅ Reel complete: /path/to/reel-....mp4"
 */
function parseReelPath(stdout) {
  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/✅ Reel complete: (.+\.mp4)/);
    if (match) return match[1].trim();
  }
  throw new Error('Could not find reel output path');
}

/**
 * Step 1: Generate a reel using generate-reel-v2.mjs
 * Picks next queued script from content-queue.json.
 */
async function generateReel() {
  console.log('🎬 Step 1: Generating Reel...');
  const scriptPath = join(__dirname, 'instagram', 'generate-reel-v2.mjs');

  // Pick next script from queue
  const picked = pickNextScript();
  if (!picked) {
    throw new Error('Content queue is empty — no queued scripts available. Add scripts to content-queue.json.');
  }
  // ── Fact-check before generating (second line of defence) ────────────────
  try {
    const { factCheck } = await import('./fact-check.mjs');
    console.log('🔍 Running fact-check on script...');
    const fcResult = await factCheck(picked.script);
    if (fcResult.scriptModified) {
      console.log(`✅ Fact-check: auto-corrected ${fcResult.corrected.length} claim(s)`);
      // Update queue entry with corrections
      const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
      queue.posts[picked.index] = picked.script;
      writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    }
    if (!fcResult.passed && fcResult.flags.length > 0) {
      const flagSummary = fcResult.flags.map(f => `${f.field}: ${f.reason}`).join('; ');
      console.warn(`⚠️  Fact-check flags (not blocking): ${flagSummary}`);
    }
  } catch (e) {
    console.warn(`⚠️  Fact-check skipped: ${e.message}`);
  }

  // ── Quality gate check (blocks if hard failures) ───────────────────────────
  try {
    const { checkQuality } = await import('./instagram/quality-gate.mjs');
    console.log('🔍 Running quality gate on script...');
    const qgResult = await checkQuality(picked.script);
    if (!qgResult.passed) {
      console.warn(`❌ Quality gate FAILED for "${picked.script.id}":`);
      for (const block of qgResult.hardBlocks) {
        console.warn(`   [${block.id}] ${block.name}: ${block.issues.map(i => i.match).join(', ')}`);
      }
      // Mark this script as blocked and try next one
      const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
      queue.posts[picked.index].status = 'blocked';
      queue.posts[picked.index].blockedAt = new Date().toISOString();
      queue.posts[picked.index].blockReason = qgResult.hardBlocks.map(b => `${b.id}: ${b.name}`).join('; ');
      writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
      console.log(`⏭️ Script marked as blocked. Looking for next script...`);
      
      // Recursively try next script (with depth limit to prevent infinite loop)
      const nextPicked = pickNextScript();
      if (!nextPicked) {
        throw new Error('No more scripts available after quality gate rejection.');
      }
      // Return recursive call but with a simple depth counter via environment
      const depth = parseInt(process.env._QG_DEPTH || '0', 10);
      if (depth >= 3) {
        throw new Error('Quality gate rejected 3 scripts in a row. Manual review required.');
      }
      process.env._QG_DEPTH = String(depth + 1);
      return generateReel(); // Recursive call to try next script
    }
    if (qgResult.softBlocks.length > 0) {
      console.log(`⚠️ Quality gate passed with ${qgResult.softBlocks.length} warning(s)`);
    } else {
      console.log(`✅ Quality gate passed`);
    }
  } catch (e) {
    if (e.message.includes('Quality gate rejected') || e.message.includes('No more scripts')) {
      throw e; // Re-throw blocking errors
    }
    console.warn(`⚠️ Quality gate skipped: ${e.message}`);
  }

  const tmpScriptPath = writeScriptTemp(picked.script);
  console.log(`📋 Using script: "${picked.script.id}" [${picked.script.pillar}] — "${picked.script.topic}"`);

  try {
    const { stdout } = await exec('node', [scriptPath, tmpScriptPath], dirname(scriptPath));
    const reelPath = parseReelPath(stdout);
    console.log(`✅ Reel generated: ${reelPath}`);
    return { reelPath, pickedScript: picked };
  } catch (err) {
    console.error('❌ Reel generation failed:', err.message);
    throw err;
  }
}

/**
 * Step 2: Upload MP4 to R2 (returns public URL)
 */
async function uploadToR2ForTikTok(videoPath) {
  console.log('☁️  Step 2: Uploading to R2...');
  try {
    const { uploadToR2 } = await import('./instagram/upload-to-r2.mjs');
    const key = `crosspost/${Date.now()}.mp4`;
    const publicUrl = await uploadToR2(videoPath, key);
    console.log(`✅ R2 URL: ${publicUrl}`);
    
    // Verify URL is accessible before proceeding (Fix 6)
    await verifyR2Url(publicUrl);
    
    return publicUrl;
  } catch (err) {
    console.error('❌ R2 upload/verification failed:', err.message);
    throw err;
  }
}

/**
 * Step 3: Post to Instagram Reels.
 */
async function postToInstagram(videoUrl, caption = generateCaption()) {
  console.log('📸 Step 3: Posting to Instagram Reels...');
  try {
    const { uploadReelToInstagram } = await import('./instagram/post-reel.mjs');
    const mediaId = await uploadReelToInstagram(videoUrl, caption);
    console.log(`✅ Instagram Reel published: ${mediaId}`);
    return { success: true, mediaId };
  } catch (err) {
    console.error('❌ Instagram Reel upload failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Golden Hour reminder — send to Lennart after IG post goes live.
 * First 60 min of engagement heavily weights algorithmic reach.
 */
async function sendGoldenHourReminder(script) {
  const TG_BOT_TOKEN = loadOpenClawConfig()?.channels?.telegram?.botToken;
  if (!TG_BOT_TOKEN) return;
  const topic = script?.topic || 'today\'s post';
  const msg = `⏱️ *Golden hour* — "${topic}" just went live on Instagram.\n\nEngage with every comment in the next 60 min. Early engagement is the #1 algorithm signal on IG.`;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '2046511634',
        text: msg,
        parse_mode: 'Markdown',
      }),
    });
    console.log('⏱️  Golden hour reminder sent.');
  } catch (err) {
    console.warn('⚠️  Golden hour reminder failed:', err.message);
  }
}

// ── Hashtag maps (shared across all platform caption generators) ──────────────

const TOOL_TAGS = {
  'perplexity': '#perplexityai',
  'gemini': '#geminiapp',
  'gemini deep research': '#geminiapp',
  'claude': '#claudeai',
  'chatgpt': '#chatgpt',
  'notebooklm': '#notebooklm',
  'midjourney': '#midjourney',
  'n8n': '#n8nautomation',
  'zapier': '#zapier',
  'make': '#makeautomation',
  'runway': '#runwayml',
  'elevenlabs': '#elevenlabs',
  'gpt': '#openai',
  'openai': '#openai',
  'suno': '#sunoai',
  'kling': '#klingai',
  'descript': '#descript',
  'notion': '#notionai',
  'canva': '#canva',
  'gamma': '#gammaapp',
};

const PILLAR_TAGS = {
  'Workflow': '#aiworkflow',
  'Comparison': '#aicomparison',
  'Hidden Feature': '#aihacks',
  'Time/Money Math': '#savetime',
  'Myth Bust': '#aidebunked',
};

const CORE_TAGS = ['#aitools', '#solopreneur', '#productivity'];
const BRAND_TAG = '#toolsforbuilders';

/**
 * Build a deduplicated hashtag array for any platform.
 * Priority order: pillar → tool-specific → core → branded.
 * @param {object|null} script - Content queue script object
 * @param {number} max - Max number of tags to return
 * @returns {string[]} Array of hashtag strings
 */
function buildTags(script, max = 12) {
  if (!script) return [...CORE_TAGS, BRAND_TAG].slice(0, max);
  const toolNames = (script.points || []).map(p => p.toolName).filter(Boolean);
  const toolTags = toolNames.map(t => TOOL_TAGS[t.toLowerCase()] || null).filter(Boolean);
  const pillarTag = PILLAR_TAGS[script.pillar] || '#workflow';
  return [...new Set([pillarTag, ...toolTags, ...CORE_TAGS, BRAND_TAG])].slice(0, max);
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate caption for the daily crosspost.
 */
function generateCaption(script) {
  if (script) {
    const pillarEmoji = { 'Workflow': '⚙️', 'Comparison': '⚖️', 'Hidden Feature': '🔍', 'Time/Money Math': '💰', 'Myth Bust': '💥' };
    const emoji = pillarEmoji[script.pillar] || '🛠️';
    const toolNames = [...new Set((script.points || []).map(p => p.toolName).filter(Boolean))];
    const toolLine = toolNames.length ? `\n${toolNames.join(' → ')}` : '';
    const allTags = buildTags(script, 12);
    return `${emoji} ${script.topic}${toolLine}\n\nSave this. Follow @toolsforbuilders for one workflow every day.\n\n${allTags.join(' ')}`;
  }
  return `🛠️ Daily AI Workflow\n\nFollow @toolsforbuilders for one practical AI workflow every day.\n\n${[...CORE_TAGS, BRAND_TAG].join(' ')}`;
}

/**
 * Step 4: Upload to YouTube Shorts.
 */
async function postToYouTube(videoPath, script) {
  console.log('📺 Step 4: Uploading to YouTube Shorts...');
  try {
    const { uploadToYouTube } = await import('./youtube/upload-to-youtube.mjs');
    const title = script?.topic ? `${script.topic} #Shorts` : 'AI Workflow for Solopreneurs #Shorts';
    // YouTube: 5 hashtags at end of description (first 3 appear above video title)
    const ytTags = buildTags(script, 5);
    const description = script
      ? `${script.topic}\n\nSave this workflow. Subscribe for one AI tool workflow every day.\n\n${ytTags.join(' ')}`
      : `AI tools for solopreneurs. Subscribe for more.\n\n${[...CORE_TAGS, BRAND_TAG].slice(0, 5).join(' ')}`;
    // Backend tags (not visible to viewers but help with discovery)
    const tags = ['AI tools', 'solopreneur', 'productivity', 'workflow', 'AI workflow',
      ...(script?.pillar ? [script.pillar] : []),
      ...((script?.points || []).map(p => p.toolName).filter(Boolean)),
    ];
    
    // Pass hook slide as thumbnail — frame-0.png saved by generate-reel-v2.mjs
    const hookFramePath = join(__dirname, 'instagram/data/tmp/reel/frame-0.png');
    const thumbnailPath = existsSync(hookFramePath) ? hookFramePath : undefined;
    if (!thumbnailPath) console.warn('⚠️ Hook frame not found — YouTube will auto-select thumbnail');

    const result = await uploadToYouTube(videoPath, { title, description, tags, thumbnailPath });
    
    // Handle structured error (quota exceeded, etc.) — don't throw, just return failure
    if (result && result.success === false) {
      console.warn(`⚠️ YouTube upload returned failure: ${result.error}`);
      return { success: false, error: result.error };
    }
    
    const url = result?.url || result;
    console.log(`✅ YouTube uploaded: ${url}`);
    // Return videoId directly (available since upload-to-youtube now returns it)
    return { success: true, url, videoId: result?.videoId || null, thumbnailSet: result?.thumbnailSet || false };
  } catch (err) {
    console.error('❌ YouTube upload failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
/**
 * Generate a TikTok-optimised caption for the script.
 * First line = hook (scroll-stopper). Body = tools used. CTA + hashtags.
 */
function generateTikTokCaption(script) {
  if (!script) return `🛠️ AI workflow for solopreneurs\n\n${[...CORE_TAGS, BRAND_TAG].slice(0, 5).join(' ')}`;

  // First line = hook (scroll-stopper on FYP — first sentence of hookTTS)
  const hookLine = script.hookTTS
    ? script.hookTTS.split('.')[0].trim()
    : script.topic;

  // Tool chain line
  const tools = [...new Set((script.points || []).map(p => p.toolName).filter(Boolean))];
  const toolLine = tools.length ? `\nTools: ${tools.join(' → ')}` : '';

  // 5 tags max via shared buildTags helper
  const tags = buildTags(script, 5);

  return `${hookLine}${toolLine}\n\nSave this 👇 Follow @toolsforbuilders for one AI workflow every day.\n\n${tags.join(' ')}`;
}

/**
 * Step 5: TikTok manual handoff.
 * Sends video + ready-to-paste caption to Lennart via Telegram.
 * TikTok app review is pending — manual posting for now.
 */
async function sendTikTokHandoff(videoPath, r2Url, script) {
  console.log('📱 Step 5: Preparing TikTok manual handoff...');
  const caption = generateTikTokCaption(script);

  const TG_BOT_TOKEN = loadOpenClawConfig()?.channels?.telegram?.botToken;
  if (!TG_BOT_TOKEN) {
    console.warn('⚠️  No Telegram token — skipping TikTok handoff');
    return { success: false, error: 'No Telegram token' };
  }

  const TG_API = `https://api.telegram.org/bot${TG_BOT_TOKEN}`;
  const TG_CHAT_ID = '-1003879867373';
  const TG_TOPIC_ID = 3;

  try {
    // Send the video file
    const { createReadStream, statSync } = await import('fs');
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    form.append('message_thread_id', String(TG_TOPIC_ID));
    form.append('video', createReadStream(videoPath), { filename: 'reel.mp4', contentType: 'video/mp4' });
    form.append('caption', `🎵 *TikTok — ready to post manually*\n\nCopy caption below 👇`);
    form.append('parse_mode', 'Markdown');

    const videoRes = await fetch(`${TG_API}/sendVideo`, { method: 'POST', body: form, headers: form.getHeaders() });
    const videoData = await videoRes.json();
    if (!videoData.ok) throw new Error(`sendVideo failed: ${videoData.description}`);

    // Send the caption as a separate copyable message
    const captionRes = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        message_thread_id: TG_TOPIC_ID,
        text: `📋 *TikTok caption — copy & paste:*\n\n\`\`\`\n${caption}\n\`\`\``,
        parse_mode: 'Markdown',
      }),
    });
    const captionData = await captionRes.json();
    if (!captionData.ok) throw new Error(`sendMessage failed: ${captionData.description}`);

    console.log('✅ TikTok handoff sent to Telegram topic 3');
    return { success: true, manual: true, caption };
  } catch (err) {
    console.error('❌ TikTok handoff failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Save results to logs/crosspost-YYYY-MM-DD.json
 */
function saveResults(results) {
  const logsDir = join(__dirname, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const logPath = join(logsDir, `crosspost-${date}.json`);
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`📊 Results saved: ${logPath}`);
  return logPath;
}

/**
 * Cleanup old files (Fix 9 & Fix 12):
 * - Delete .mp4 files in instagram/data/samples/reels/ older than 7 days
 * - Delete log files in logs/ older than 30 days
 * Wrapped in try/catch so cleanup failure doesn't break the pipeline.
 */
function cleanupOldFiles() {
  console.log('🧹 Running cleanup...');
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  
  // Cleanup old reel files (7 days)
  try {
    const reelsDir = join(__dirname, 'instagram/data/samples/reels');
    if (existsSync(reelsDir)) {
      const files = readdirSync(reelsDir);
      let deletedReels = 0;
      for (const file of files) {
        if (!file.endsWith('.mp4')) continue;
        const filePath = join(reelsDir, file);
        try {
          const stat = statSync(filePath);
          if (now - stat.mtimeMs > SEVEN_DAYS_MS) {
            rmSync(filePath);
            deletedReels++;
          }
        } catch (e) {
          console.warn(`⚠️ Could not process ${file}: ${e.message}`);
        }
      }
      if (deletedReels > 0) {
        console.log(`   🗑️ Deleted ${deletedReels} old reel file(s) (>7 days)`);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Reel cleanup failed: ${err.message}`);
  }
  
  // Cleanup old log files (30 days)
  try {
    const logsDir = join(__dirname, 'logs');
    if (existsSync(logsDir)) {
      const files = readdirSync(logsDir);
      let deletedLogs = 0;
      for (const file of files) {
        const filePath = join(logsDir, file);
        try {
          const stat = statSync(filePath);
          if (now - stat.mtimeMs > THIRTY_DAYS_MS) {
            rmSync(filePath);
            deletedLogs++;
          }
        } catch (e) {
          console.warn(`⚠️ Could not process ${file}: ${e.message}`);
        }
      }
      if (deletedLogs > 0) {
        console.log(`   🗑️ Deleted ${deletedLogs} old log file(s) (>30 days)`);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Log cleanup failed: ${err.message}`);
  }
  
  console.log('🧹 Cleanup complete.');
}

/**
 * Load Telegram config from Instagram .env.secrets
 */
function loadTelegramConfig() {
  const envPath = join(__dirname, 'instagram', '.env.secrets');
  if (!existsSync(envPath)) {
    console.warn('⚠️  Instagram .env.secrets not found');
    return null;
  }
  
  const env = {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  
  const botToken = env.TG_BOT_TOKEN;
  const chatId = '-1003879867373'; // Skynet HQ forum group
  
  if (!botToken) {
    console.warn('⚠️  TG_BOT_TOKEN not found in .env.secrets');
    return null;
  }
  
  return { botToken, chatId };
}

/**
 * Send Telegram summary to forum group.
 */
async function sendTelegramSummary(results) {
  try {
    const config = loadTelegramConfig();
    if (!config) {
      console.log('📱 Telegram config not available, skipping notification.');
      return;
    }
    
    const { botToken, chatId } = config;
    
    // Count successes
    const platforms = ['generateReel', 'uploadR2', 'instagram', 'youtube', 'tiktok'];
    const succeeded = platforms.filter(p => results.steps[p]?.success);
    const failed = platforms.filter(p => !results.steps[p]?.success);
    
    const date = new Date().toISOString().slice(0, 10);
    let message = `📊 Daily Cross-Post Summary (${date})\n\n`;
    
    // Add platform status
    const statusEmoji = (platform, result) => {
      if (!result) return '❓';
      return result.success ? '✅' : '❌';
    };
    
    message += `🎬 Reel gen: ${statusEmoji('generateReel', results.steps.generateReel)}\n`;
    message += `☁️  R2 upload: ${statusEmoji('uploadR2', results.steps.uploadR2)}\n`;
    message += `📸 Instagram: ${statusEmoji('instagram', results.steps.instagram)}\n`;
    message += `📺 YouTube: ${statusEmoji('youtube', results.steps.youtube)}\n`;
    message += `🎵 TikTok: ${results.steps.tiktok?.manual ? '📲 Caption sent — post manually' : statusEmoji('tiktok', results.steps.tiktok)}\n`;
    
    if (failed.length > 0) {
      message += `\n⚠️  ${failed.length} platform(s) failed:\n`;
      failed.forEach(p => {
        const error = results.steps[p]?.error || 'Unknown error';
        message += `• ${p}: ${error.substring(0, 100)}\n`;
      });
    } else {
      message += `\n🎉 All platforms succeeded!`;
    }
    
    // Send via Telegram Bot API
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        message_thread_id: 1, // General topic in forum
        parse_mode: 'HTML',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API: ${response.status} ${errorText}`);
    }
    
    console.log('📱 Telegram summary sent.');
  } catch (err) {
    console.error('Failed to send Telegram summary:', err.message);
    // Don't fail the whole pipeline if Telegram fails
  }
}

/**
 * Main pipeline
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Daily Cross-Posting Pipeline for @toolsforbuilders');
  console.log(`🕐 ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // ── Preflight check (abort if critical failures) ──────────────────────────
  if (!process.env.DRYRUN) {
    try {
      const { spawn } = await import('child_process');
      const preflight = spawn('node', [join(__dirname, 'preflight.mjs'), '--quiet'], { stdio: 'inherit' });
      const exitCode = await new Promise(resolve => preflight.on('close', resolve));
      if (exitCode !== 0) {
        console.error('❌ Preflight failed — aborting pipeline');
        process.exit(1);
      }
      console.log('✅ Preflight passed\n');
    } catch (e) {
      console.warn(`⚠️ Preflight skipped: ${e.message}`);
    }
  }

  const results = {
    date: new Date().toISOString(),
    steps: {},
  };

  let reelPath = null;
  let r2Url = null;
  let pickedScript = null;

  // Step 1: Generate Reel
  try {
    ({ reelPath, pickedScript } = await generateReel());
    results.steps.generateReel = { success: true, path: reelPath, scriptId: pickedScript?.script?.id };
  } catch (err) {
    results.steps.generateReel = { success: false, error: err.message };
    console.error('❌ Pipeline halted: Reel generation failed.');
    saveResults(results);
    process.exit(1);
  }

  // Step 2: Upload to R2 (required for TikTok)
  if (DRYRUN) {
    console.log('☁️  [DRYRUN] Would upload to R2...');
    r2Url = 'https://example.com/dryrun-video.mp4';
    results.steps.uploadR2 = { success: true, url: r2Url, dryrun: true };
  } else {
    try {
      r2Url = await uploadToR2ForTikTok(reelPath);
      results.steps.uploadR2 = { success: true, url: r2Url };
    } catch (err) {
      results.steps.uploadR2 = { success: false, error: err.message };
      // Continue anyway? TikTok will fail but YouTube may work.
      console.warn('⚠️  R2 upload failed; TikTok will likely fail.');
    }
  }

  // Step 3: Approval flow (if R2 URL available)
  let approvalGranted = false;
  let approvalReason = '';

  if (r2Url) {
    const caption = generateCaption(pickedScript?.script);
    
    if (DRYRUN) {
      console.log('📋 [DRYRUN] Would request approval for daily crosspost...');
      console.log('📋 [DRYRUN] Caption preview:');
      console.log('─'.repeat(40));
      console.log(caption);
      console.log('─'.repeat(40));
      approvalGranted = true; // Assume approved in dry run
      approvalReason = 'dryrun_auto_approved';
    } else {
      console.log('📋 Requesting approval for daily crosspost...');
      approvalGranted = await requestApproval(r2Url, caption);
      
      if (approvalGranted) {
        console.log('✅ Approval granted, proceeding with posting.');
        approvalReason = 'approved';
      } else {
        console.log('❌ Approval not granted (rejected or timeout), skipping today.');
        approvalReason = 'rejected_or_timeout';
        // Send alert
        await sendAlert(`Daily crosspost skipped — ${approvalReason}.`);
        // Skip all posting platforms
        results.steps.instagram = { success: false, error: 'skipped - not approved' };
        results.steps.youtube = { success: false, error: 'skipped - not approved' };
        results.steps.tiktok = { success: false, error: 'skipped - not approved' };
        // Save results and exit early
        const logPath = saveResults(results);
        await sendTelegramSummary(results);
        console.log('\n' + '='.repeat(60));
        console.log('📦 Pipeline halted — post not approved.');
        console.log(`📄 Full log: ${logPath}`);
        console.log('='.repeat(60));
        return;
      }
    }
  } else {
    console.warn('⚠️  R2 URL missing, skipping approval flow.');
  }

  // Step 3: Instagram Reels (requires R2 URL)
  let instagramResult = { success: false, error: 'R2 upload missing' };
  if (r2Url) {
    const caption = generateCaption(pickedScript?.script); // same caption as approval
    if (DRYRUN) {
      console.log('📸 [DRYRUN] Would post to Instagram...');
      instagramResult = { success: true, mediaId: 'dryrun-ig-media-id', dryrun: true };
    } else {
      instagramResult = await postToInstagram(r2Url, caption);
      if (instagramResult.success) {
        await sendGoldenHourReminder(pickedScript?.script);
      }
    }
  } else {
    console.warn('⚠️  Instagram Reels skipped due to missing R2 URL.');
  }
  results.steps.instagram = instagramResult;

  // Step 4: YouTube
  let youtubeResult;
  if (DRYRUN) {
    const title = pickedScript?.script?.topic ? `${pickedScript.script.topic} #Shorts` : 'AI Workflow for Solopreneurs #Shorts';
    const ytTags = buildTags(pickedScript?.script, 5);
    const description = pickedScript?.script
      ? `${pickedScript.script.topic}\n\nSave this workflow. Subscribe for one AI tool workflow every day.\n\n${ytTags.join(' ')}`
      : `AI tools for solopreneurs. Subscribe for more.`;
    const tags = ['AI tools', 'solopreneur', 'productivity', 'workflow', 'AI workflow',
      ...(pickedScript?.script?.pillar ? [pickedScript.script.pillar] : []),
      ...((pickedScript?.script?.points || []).map(p => p.toolName).filter(Boolean)),
    ];
    console.log('📺 [DRYRUN] Would post to YouTube...');
    console.log(`   Title: ${title}`);
    console.log(`   Description: ${description.substring(0, 100)}...`);
    console.log(`   Tags: ${tags.join(', ')}`);
    youtubeResult = { success: true, url: 'https://youtu.be/dryrun', videoId: 'dryrun-yt-id', dryrun: true };
  } else {
    youtubeResult = await postToYouTube(reelPath, pickedScript?.script);
  }
  results.steps.youtube = youtubeResult;

  // Step 4b: Always send hook slide to Telegram for manual YouTube Studio thumbnail upload.
  // YouTube Shorts thumbnails set via API silently fail — Studio upload is the only reliable method.
  const hookFramePath = join(__dirname, 'instagram/data/tmp/reel/frame-0.png');
  if (youtubeResult?.success && existsSync(hookFramePath) && !DRYRUN) {
    try {
      const cfg = JSON.parse(readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
      const botToken = cfg.channels?.telegram?.botToken;
      const FormData = (await import('form-data')).default;
      const { createReadStream: crs } = await import('fs');
      const form = new FormData();
      form.append('chat_id', '-1003879867373');
      form.append('message_thread_id', '3');
      form.append('photo', crs(hookFramePath), { filename: 'hook-thumbnail.png', contentType: 'image/png' });
      const ytUrl = youtubeResult?.url || youtubeResult?.videoId || '(check YouTube Studio)';
      form.append('caption',
        `🖼️ *YouTube thumbnail*\n\nVideo: ${ytUrl}\n\nYouTube Studio → Content → ✏️ edit → Thumbnail → Upload thumbnail → Save`
      );
      form.append('parse_mode', 'Markdown');
      await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: form });
      console.log('✅ Hook slide sent to Telegram for YouTube thumbnail.');
    } catch (tgErr) {
      console.warn('⚠️ Could not send thumbnail to Telegram:', tgErr.message);
    }
  } else if (DRYRUN && youtubeResult?.success) {
    console.log('📸 [DRYRUN] Would send hook slide to Telegram for YouTube thumbnail');
  }

  // Step 5: TikTok — manual handoff (sends video + caption to Telegram)
  let tiktokResult;
  if (DRYRUN) {
    const tiktokCaption = generateTikTokCaption(pickedScript?.script);
    console.log('📲 [DRYRUN] Would send TikTok handoff to Telegram...');
    console.log('📲 [DRYRUN] TikTok caption preview:');
    console.log('─'.repeat(40));
    console.log(tiktokCaption);
    console.log('─'.repeat(40));
    tiktokResult = { success: true, manual: true, dryrun: true };
  } else {
    tiktokResult = await sendTikTokHandoff(reelPath, r2Url, pickedScript?.script);
  }
  results.steps.tiktok = tiktokResult;

  // Mark script as used and archive it (only if at least one platform succeeded)
  const anySuccess = [results.steps.instagram, results.steps.youtube, results.steps.tiktok]
    .some(s => s?.success);
  
  if (DRYRUN) {
    console.log('\n' + '═'.repeat(60));
    console.log('📋 DRY RUN SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Script: ${pickedScript?.script?.id}`);
    console.log(`Topic: ${pickedScript?.script?.topic}`);
    console.log(`Pillar: ${pickedScript?.script?.pillar}`);
    console.log(`Instagram: ${results.steps.instagram?.success ? '✅ would post' : '❌ would skip'}`);
    console.log(`YouTube: ${results.steps.youtube?.success ? '✅ would post' : '❌ would skip'}`);
    console.log(`TikTok: ${results.steps.tiktok?.success ? '✅ would send handoff' : '❌ would skip'}`);
    console.log('─'.repeat(60));
    console.log('No actual API calls were made.');
    console.log('Script NOT marked as used.');
    console.log('Archive NOT updated.');
    console.log('═'.repeat(60));
    process.exit(0);
  }
  
  if (anySuccess && pickedScript) {
    // Build platform results with full details for analytics
    const platformResults = {
      instagram: {
        success: results.steps.instagram?.success || false,
        mediaId: results.steps.instagram?.mediaId || null,
      },
      youtube: {
        success: results.steps.youtube?.success || false,
        videoId: results.steps.youtube?.videoId || extractYouTubeVideoId(results.steps.youtube?.url) || null,
      },
      tiktok: {
        success: results.steps.tiktok?.success || false,
        manual: results.steps.tiktok?.manual || false,
      },
    };
    markScriptUsed(pickedScript.script, pickedScript.index, platformResults);
    checkQueueHealth();
  }

  // Save results
  const logPath = saveResults(results);

  // Send summary
  await sendTelegramSummary(results);

  // Cleanup old files (Fix 9 & 12 — runs regardless of success/failure)
  cleanupOldFiles();

  // Ping Uptime Kuma push monitor (heartbeat — confirms job ran successfully)
  if (anySuccess) {
    try {
      await fetch('http://localhost:3002/api/push/815250df49c021c1c6c36ba8a3d3ffea?status=up&msg=OK');
      console.log('💓 Uptime Kuma heartbeat sent.');
    } catch (e) {
      console.warn('⚠️  Uptime Kuma ping failed (non-critical):', e.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📦 Pipeline completed.');
  console.log(`📄 Full log: ${logPath}`);
  console.log('='.repeat(60));
}

main().catch(async err => {
  console.error('🔥 Unhandled pipeline error:', err);
  try {
    await sendAlert(`🔥 Daily crosspost CRASHED: ${err.message}\n\nCheck /tmp/daily-crosspost.log`);
  } catch {}
  process.exit(1);
});