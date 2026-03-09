/**
 * One-shot: post pre-generated reel v5 to Instagram + YouTube + TikTok handoff.
 * Skips generation — uses existing file.
 */
import { readFileSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// form-data loaded dynamically from instagram node_modules

const __dirname = dirname(fileURLToPath(import.meta.url));

const REEL_PATH = join(__dirname, 'data/samples/reels/reel-2026-03-05T07-16-08.mp4');
const R2_ENDPOINT = 'https://afe99febd94143a34deea0d688a5aa27.r2.cloudflarestorage.com';
const R2_BUCKET = 'toolsforbuilders';
const R2_KEY_ID = 'bc2f0e6a5184e30497c18b24c87f2617';
const R2_SECRET = '8e49305b7284ce4f24a91a2d29a5997511b15ad7731c730f461d11725e69fd83';
const R2_PUBLIC = 'https://pub-eaeb2430ed1641509dc5b2dde7a70b0b.r2.dev';

// Script metadata for captions
const script = {
  topic: 'Cut your research time to 20 minutes with 3 AI tools',
  pillar: 'Workflow',
  hookTTS: 'You spend hours on research. I spend twenty minutes. Here is the exact setup.',
  points: [
    { toolName: 'NotebookLM' },
    { toolName: 'Claude' },
    { toolName: 'Gemini' },
  ],
};

function getAnthropicKey() { return null; } // not needed here

function generateCaption(s) {
  const emoji = '⚙️';
  const tools = s.points.map(p => p.toolName).join(' → ');
  return `${emoji} ${s.topic}\n${tools}\n\nSave this workflow. Follow @toolsforbuilders for one like it every day.\n\n#aitools #solopreneur #productivity #workflow #aiworkflow #notebooklm #claudeai #googlegemini`;
}

function generateTikTokCaption(s) {
  const hookLine = s.hookTTS.split('.')[0].trim();
  const tools = s.points.map(p => p.toolName).join(' → ');
  return `${hookLine}\n\nTools: ${tools}\n\nSave this 👇 Follow @toolsforbuilders for one AI workflow every day.\n\n#solopreneur #aitools #workflow #aiworkflow #notebooklm #claudeai #googlegemini`;
}

async function uploadToR2(videoPath) {
  console.log('☁️  Uploading to R2...');
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_KEY_ID, secretAccessKey: R2_SECRET },
  });
  const key = `crosspost/${Date.now()}.mp4`;
  const body = readFileSync(videoPath);
  await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'video/mp4' }));
  const url = `${R2_PUBLIC}/${key}`;
  console.log('✅ R2:', url);
  return url;
}

async function postToInstagram(r2Url, caption) {
  console.log('📸 Posting to Instagram...');
  const { uploadReelToInstagram } = await import('./post-reel.mjs');
  const mediaId = await uploadReelToInstagram(r2Url, caption);
  console.log('✅ Instagram media ID:', mediaId);
  return mediaId;
}

async function postToYouTube(videoPath) {
  console.log('📺 Uploading to YouTube...');
  const { uploadToYouTube } = await import('../youtube/upload-to-youtube.mjs');
  const title = `${script.topic} #Shorts`;
  const description = `${generateCaption(script)}\n\nSubscribe for one AI workflow every day.`;
  const tags = ['AI', 'solopreneur', 'productivity', 'workflow', 'aitools', 'notebooklm', 'claudeai', 'gemini'];
  const url = await uploadToYouTube(videoPath, { title, description, tags });
  console.log('✅ YouTube:', url);
  return url;
}

async function sendTikTokHandoff(videoPath) {
  console.log('📱 Sending TikTok handoff to Telegram...');
  const secrets = readFileSync(join(__dirname, '.env.secrets'), 'utf8');
  const token = secrets.match(/TG_BOT_TOKEN=(.+)/)?.[1]?.trim();
  if (!token) { console.warn('⚠️  No TG_BOT_TOKEN in .env.secrets'); return; }
  return sendTelegram(token, videoPath);
}

async function sendTelegram(token, videoPath) {
  const TG_API = `https://api.telegram.org/bot${token}`;
  const CHAT_ID = '-1003879867373';
  const TOPIC_ID = 3;
  const caption = generateTikTokCaption(script);

  const { default: FormData } = await import('form-data/lib/form_data.js');
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('message_thread_id', String(TOPIC_ID));
  form.append('video', createReadStream(videoPath), { filename: 'reel-v5.mp4', contentType: 'video/mp4' });
  form.append('caption', '🎵 *TikTok — ready to post manually*\n\nCopy caption below 👇');
  form.append('parse_mode', 'Markdown');

  await fetch(`${TG_API}/sendVideo`, { method: 'POST', body: form, headers: form.getHeaders() });

  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_thread_id: TOPIC_ID,
      text: `📋 *TikTok caption — copy & paste:*\n\n\`\`\`\n${caption}\n\`\`\``,
      parse_mode: 'Markdown',
    }),
  });
  console.log('✅ TikTok handoff sent');
}

async function main() {
  console.log('🚀 Posting reel v5 — research workflow\n');
  const r2Url = await uploadToR2(REEL_PATH);
  const caption = generateCaption(script);

  const [igResult, ytResult] = await Promise.allSettled([
    postToInstagram(r2Url, caption),
    postToYouTube(REEL_PATH),
  ]);

  console.log('\nInstagram:', igResult.status, igResult.reason || '');
  console.log('YouTube:', ytResult.status, ytResult.reason || '');

  await sendTikTokHandoff(REEL_PATH);
  console.log('\n✅ Done.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
