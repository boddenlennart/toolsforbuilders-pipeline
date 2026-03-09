import { google } from 'googleapis';
import { readFileSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const lines = readFileSync(join(__dirname, '.env.secrets'), 'utf8').split('\n');
  const env = {};
  for (const line of lines) { const m = line.match(/^([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, ''); }
  return env;
}
const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = loadEnv();
const token = JSON.parse(readFileSync(join(__dirname, 'youtube-token.json'), 'utf8'));
const auth = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, 'urn:ietf:wg:oauth:2.0:oob');
auth.setCredentials(token);
const youtube = google.youtube({ version: 'v3', auth });

const TMP = '/root/.openclaw/workspace/scripts/instagram/data/tmp';
const videos = [
  { id: 'Sxs63CLQ_Ac', label: 'Perplexity vs Gemini', thumb: `${TMP}/clean-perplexity.png` },
  { id: 'Vmvjnk81ZR0', label: 'Cut research time',    thumb: `${TMP}/clean-research.png` },
];

for (const v of videos) {
  try {
    const result = await youtube.thumbnails.set({
      videoId: v.id,
      media: { mimeType: 'image/png', body: createReadStream(v.thumb) },
    });
    console.log(`✅ ${v.label} (${v.id}) — ${result.status}`);
  } catch (e) {
    console.error(`❌ ${v.label}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 3000));
}
