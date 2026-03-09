#!/usr/bin/env node
/**
 * post-approved-reel.mjs — One-shot: post a pre-approved reel without regenerating.
 * Used when a reel has been manually reviewed and approved before the scheduled post time.
 *
 * Usage: node post-approved-reel.mjs <video-path> <script-id>
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generatePlatformContent } from './instagram/caption-framework.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** DRYRUN mode — run all preparation logic but skip actual API calls */
const DRYRUN = process.env.DRYRUN === '1';
if (DRYRUN) console.log('🔍 DRY RUN MODE — no actual API calls will be made\n');

const QUEUE_PATH = join(__dirname, 'instagram/data/content-queue.json');
const ARCHIVE_PATH = join(__dirname, 'instagram/data/archive/published.json');

const videoPath = process.argv[2];
const scriptId  = process.argv[3];

if (!videoPath || !scriptId) {
  console.error('Usage: node post-approved-reel.mjs <video-path> <script-id>');
  process.exit(1);
}
if (!existsSync(videoPath)) {
  console.error(`Video not found: ${videoPath}`);
  process.exit(1);
}

// ── Load script from queue ────────────────────────────────────────────────────
const queue  = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
const idx    = queue.posts.findIndex(p => p.id === scriptId);
if (idx === -1) {
  console.error(`Script id not found in queue: ${scriptId}`);
  process.exit(1);
}
const script = queue.posts[idx];

// ── Import posting helpers ────────────────────────────────────────────────────
const loadOpenClawConfig = () => JSON.parse(readFileSync('/root/.openclaw/openclaw.json', 'utf8'));

async function uploadToR2ForTikTok(videoPath) {
  const { uploadToR2: upload } = await import('./instagram/upload-to-r2.mjs');
  const key = `crosspost/${Date.now()}.mp4`;
  return upload(videoPath, key);
}

async function main() {
  console.log(`\n🚀 Posting pre-approved reel: ${scriptId}`);
  console.log(`📹 Video: ${videoPath}`);

  // Generate all platform content upfront via unified framework
  const platformContent = generatePlatformContent(script);
  const igCaption = platformContent.instagram.caption;
  const tikTokCaption = platformContent.tiktok.caption;
  const { title, description: ytDescription, backendTags: ytBackendTags } = platformContent.youtube;

  // ── Step 1: Upload to R2 ──────────────────────────────────────────────────
  let r2Url;
  if (DRYRUN) {
    console.log('\n☁️  [DRYRUN] Would upload to R2...');
    r2Url = 'https://example.com/dryrun-video.mp4';
  } else {
    console.log('\n☁️  Uploading to R2...');
    try {
      r2Url = await uploadToR2ForTikTok(videoPath);
      console.log(`✅ R2 URL: ${r2Url}`);
    } catch (err) {
      console.error(`❌ R2 upload failed: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Step 2: Post to Instagram ─────────────────────────────────────────────
  let igResult = { success: false };
  if (DRYRUN) {
    console.log('\n📸 [DRYRUN] Would post to Instagram...');
    console.log('📸 [DRYRUN] Caption preview:');
    console.log('─'.repeat(40));
    console.log(igCaption);
    console.log('─'.repeat(40));
    igResult = { success: true, mediaId: 'dryrun-ig-media-id', dryrun: true };
  } else {
    console.log('\n📸 Posting to Instagram...');
    try {
      const { postToInstagram } = await import('./instagram/post-to-instagram.mjs');
      igResult = await postToInstagram(r2Url, igCaption);
      console.log('✅ Instagram:', JSON.stringify(igResult));
    } catch (e) {
      console.error('❌ Instagram failed:', e.message);
      igResult = { success: false, error: e.message };
    }
  }

  // ── Step 3: Post to YouTube ───────────────────────────────────────────────
  let ytResult = { success: false };
  const hookFramePath = join(__dirname, 'instagram/data/tmp/reel/frame-0.png');
  const thumbnailPath = existsSync(hookFramePath) ? hookFramePath : undefined;
  
  if (DRYRUN) {
    console.log('\n▶️  [DRYRUN] Would post to YouTube...');
    console.log(`   Title: ${title}`);
    console.log(`   Description: ${ytDescription.substring(0, 100)}...`);
    console.log(`   Tags: ${ytBackendTags.join(', ')}`);
    ytResult = { success: true, url: 'https://youtu.be/dryrun', videoId: 'dryrun-yt-id', dryrun: true };
  } else {
    console.log('\n▶️  Posting to YouTube...');
    if (!thumbnailPath) console.warn('⚠️  Hook frame not found — YouTube will pick its own thumbnail');
    try {
      const { uploadToYouTube } = await import('./youtube/upload-to-youtube.mjs');
      ytResult = await uploadToYouTube(videoPath, {
        title,
        description: ytDescription,
        tags: ytBackendTags,
        thumbnailPath,
      });
      
      // Handle structured error (quota exceeded, etc.) — don't throw, just return failure
      if (ytResult && ytResult.success === false) {
        console.warn(`⚠️ YouTube upload returned failure: ${ytResult.error}`);
      } else {
        console.log('✅ YouTube:', JSON.stringify(ytResult));
      }
    } catch (e) {
      console.error('❌ YouTube failed:', e.message);
      ytResult = { success: false, error: e.message };
    }
  }

  // ── Step 3b: Always send hook slide to Telegram after YouTube upload ──
  // YouTube Shorts thumbnails set via API return 200 but silently don't apply.
  // Manual upload via YouTube Studio is the only reliable method for Shorts.
  // We always send the hook slide so Lennart can paste it in Studio in seconds.
  if (thumbnailPath && (ytResult?.status === 'ok' || ytResult?.success) && !DRYRUN) {
    console.log('📸 Sending hook frame to Telegram for YouTube Studio thumbnail upload...');
    try {
      const cfg = loadOpenClawConfig();
      const botToken = cfg.channels?.telegram?.botToken || cfg.integrations?.telegram?.token;
      const FormData = (await import('form-data')).default;
      const { createReadStream: crs } = await import('fs');
      const form = new FormData();
      form.append('chat_id', '-1003879867373');
      form.append('message_thread_id', '3');
      form.append('photo', crs(thumbnailPath), { filename: 'hook-thumbnail.png', contentType: 'image/png' });
      const ytVideoId = ytResult?.url?.split('/').pop() || ytResult?.videoId || '(check YouTube Studio)';
      form.append('caption',
        `🖼️ *YouTube thumbnail — set manually*\n\nVideo: ${ytResult?.url || ytVideoId}\n\nYouTube Studio → Content → edit video → Thumbnail → Upload\n\n_To auto-set in future: YouTube Studio → Settings → Channel → Feature eligibility → enable Custom thumbnails_`
      );
      form.append('parse_mode', 'Markdown');
      await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: form, headers: form.getHeaders() });
      console.log('✅ Hook frame sent to Telegram for manual thumbnail upload.');
    } catch (tgErr) {
      console.warn('⚠️  Could not send thumbnail to Telegram:', tgErr.message);
    }
  } else if (DRYRUN && ytResult?.success) {
    console.log('📸 [DRYRUN] Would send hook frame to Telegram for YouTube thumbnail');
  }

  // ── Step 4: TikTok handoff (Telegram) ────────────────────────────────────
  let tiktokResult = { success: false, manual: true };
  if (DRYRUN) {
    console.log('\n📲 [DRYRUN] Would send TikTok handoff to Telegram...');
    console.log('📲 [DRYRUN] TikTok caption preview:');
    console.log('─'.repeat(40));
    console.log(tikTokCaption);
    console.log('─'.repeat(40));
    tiktokResult = { success: true, manual: true, dryrun: true };
  } else {
    console.log('\n📲 Sending TikTok handoff...');
    try {
      const cfg = loadOpenClawConfig();
      const botToken = cfg.channels?.telegram?.botToken || cfg.integrations?.telegram?.token;
      const chatId   = '-1003879867373';
      const threadId = '3';
      // Send video file
      const FormData = (await import('form-data')).default;
      const { createReadStream } = await import('fs');
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('message_thread_id', threadId);
      form.append('video', createReadStream(videoPath), { filename: 'reel.mp4', contentType: 'video/mp4' });
      form.append('caption', `🎵 *TikTok — ready to post manually*\n\nCopy caption below 👇`);
      form.append('parse_mode', 'Markdown');
      const videoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: 'POST', body: form, headers: form.getHeaders() });
      const videoData = await videoRes.json();
      if (!videoData.ok) throw new Error(`sendVideo failed: ${videoData.description}`);

      // Send the caption as a separate copyable message
      const captionRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: threadId,
          text: `📋 *TikTok caption — copy & paste:*\n\n\`\`\`\n${tikTokCaption}\n\`\`\``,
          parse_mode: 'Markdown',
        }),
      });
      const captionData = await captionRes.json();
      if (!captionData.ok) throw new Error(`sendMessage failed: ${captionData.description}`);

      console.log('✅ TikTok handoff sent to Telegram topic 3');
      tiktokResult = { success: true, manual: true, caption: tikTokCaption };
    } catch (e) {
      console.error('❌ TikTok handoff failed:', e.message);
      tiktokResult = { success: false, error: e.message };
    }
  }

  // ── DRYRUN Summary ───────────────────────────────────────────────────────
  if (DRYRUN) {
    console.log('\n' + '═'.repeat(60));
    console.log('📋 DRY RUN SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Script: ${script.id}`);
    console.log(`Topic: ${script.topic}`);
    console.log(`Pillar: ${script.pillar}`);
    console.log(`Instagram: ${igResult?.success ? '✅ would post' : '❌ would skip'}`);
    console.log(`YouTube: ${ytResult?.success ? '✅ would post' : '❌ would skip'}`);
    console.log(`TikTok: ${tiktokResult?.success ? '✅ would send handoff' : '❌ would skip'}`);
    console.log('─'.repeat(60));
    console.log('No actual API calls were made.');
    console.log('Script NOT marked as used.');
    console.log('Archive NOT updated.');
    console.log('═'.repeat(60));
    process.exit(0);
  }

  // ── Step 5: Mark script as used in queue (matches daily-crosspost.mjs) ───
  queue.posts[idx].status = 'used';
  queue.posts[idx].usedAt = new Date().toISOString();
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

  // Archive — match daily-crosspost.mjs format exactly
  let archive = { published: [] };
  if (existsSync(ARCHIVE_PATH)) {
    try { 
      const raw = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf8')); 
      archive = raw.published ? raw : { published: raw.posts || [] };
    } catch {}
  }
  archive.published.push({
    id: script.id,
    pillar: script.pillar,
    topic: script.topic,
    hookHeadline: script.hookHeadline || null,
    postedAt: new Date().toISOString(),
    platforms: {
      instagram: {
        success: igResult?.status === 'ok' || igResult?.success || false,
        mediaId: igResult?.mediaId || null,
      },
      youtube: {
        success: ytResult?.success || false,
        videoId: ytResult?.videoId || null,
      },
      tiktok: {
        success: tiktokResult?.success || false,
        manual: tiktokResult?.manual || false,
      },
    },
  });
  writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  console.log(`📦 Marked "${script.id}" as used. Archive updated.`);

  // Append to performance log so analytics-pull.mjs can track this post's metrics
  const perfLogPath = join(__dirname, 'instagram/data/performance-log.jsonl');
  const perfEntry = {
    ts: new Date().toISOString(),
    scriptId: script.id,
    pillar: script.pillar,
    topic: script.topic,
    hookHeadline: script.hookHeadline || script.topic,
    postedAt: new Date().toISOString(),
    igMediaId: igResult?.mediaId || null,
    ytVideoId: ytResult?.videoId || null,
    tiktokManual: true,
    metricsCollectedAt: null,
    daysAfterPost: null,
    instagram: null,
    youtube: null,
    tiktok: null,
  };
  try {
    appendFileSync(perfLogPath, JSON.stringify(perfEntry) + '\n');
    console.log('📊 Performance log updated.');
  } catch (e) {
    console.warn('⚠️ Performance log append failed:', e.message);
  }

  console.log(`\n✅ Done. Script marked as used.`);
  console.log(`   Instagram: ${igResult?.success ? 'ok' : igResult?.error || 'failed'}`);
  console.log(`   YouTube: ${ytResult?.success ? 'ok' : ytResult?.error || 'failed'}`);
  console.log(`   TikTok: ${tiktokResult?.success ? 'handoff sent' : tiktokResult?.error || 'failed'}`);

  // Ping Uptime Kuma push monitor — confirms daily crosspost ran successfully
  const anySuccess = igResult?.status === 'ok' || igResult?.success || ytResult?.success;
  if (anySuccess) {
    try {
      await fetch('http://localhost:3002/api/push/815250df49c021c1c6c36ba8a3d3ffea?status=up&msg=OK');
      console.log('💓 Uptime Kuma heartbeat sent.');
    } catch (e) {
      console.warn('⚠️  Uptime Kuma ping failed (non-critical):', e.message);
    }
  }
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
