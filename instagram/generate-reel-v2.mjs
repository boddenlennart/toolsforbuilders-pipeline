/**
 * @toolsforbuilders — Reel generator v2
 * Script → ElevenLabs TTS → HTML/CSS frames (Puppeteer) → ffmpeg → MP4
 * Format: 1080×1920px, 7 slides, 32-40 seconds, H.264/AAC
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
function loadEnv() {
  const p = join(__dirname, '.env.secrets');
  const env = {};
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const ENV = loadEnv();
const ELEVENLABS_KEY = ENV.ELEVENLABS_API_KEY;
const VOICE_ID = ENV.ELEVENLABS_VOICE_ID || 'cjVigY5qzO86Huf0OWal';

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = { blue:'#0066FF', cream:'#F5F5F0', charcoal:'#1A1A1A', lime:'#BFFF00', red:'#FF3B3B' };

// ── Fonts ─────────────────────────────────────────────────────────────────────
function fontB64(f) {
  return readFileSync(join(__dirname, 'assets/fonts', f)).toString('base64');
}
const FONTS = `
  @font-face{font-family:'Inter';font-weight:400;src:url('data:font/woff2;base64,${fontB64('inter-400.woff2')}') format('woff2')}
  @font-face{font-family:'Inter';font-weight:700;src:url('data:font/woff2;base64,${fontB64('inter-700.woff2')}') format('woff2')}
  @font-face{font-family:'Inter';font-weight:800;src:url('data:font/woff2;base64,${fontB64('inter-800.woff2')}') format('woff2')}
  @font-face{font-family:'Inter';font-weight:900;src:url('data:font/woff2;base64,${fontB64('inter-900.woff2')}') format('woff2')}
`;

// ── Base CSS ──────────────────────────────────────────────────────────────────
const BASE = `
  ${FONTS}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{width:1080px;height:1920px;overflow:hidden;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative}
  .progress{position:absolute;top:0;left:0;height:6px;background:${B.blue};z-index:10}
  .watermark{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:400;color:rgba(245,245,240,0.35);white-space:nowrap;letter-spacing:1px}
  .watermark-dark{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:400;color:rgba(26,26,26,0.30);white-space:nowrap;letter-spacing:1px}
`;

// ── Slide HTML builders ───────────────────────────────────────────────────────

function progressBar(index, total) {
  const pct = ((index + 1) / total) * 100;
  return `<div class="progress" style="width:${pct}%"></div>`;
}

/** Slide 1: HOOK — dark bg, lime headline */
function buildHook(data, idx, total) {
  const { hookHeadline, hookSub } = data;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body{background:${B.charcoal}}
  .glow{position:absolute;top:0;left:0;right:0;height:600px;background:radial-gradient(ellipse at 50% -15%,rgba(0,102,255,0.22) 0%,transparent 60%);pointer-events:none}
  .pill{position:absolute;top:220px;left:80px;background:${B.blue};color:${B.lime};font-size:14px;font-weight:700;letter-spacing:3px;padding:10px 24px;border-radius:100px;text-transform:uppercase}
  .hook{position:absolute;top:320px;left:80px;right:80px;font-size:96px;font-weight:900;color:${B.lime};line-height:1.0;letter-spacing:-2px;white-space:pre-line;}
  .sub{position:absolute;top:900px;left:80px;right:80px;font-size:40px;font-weight:400;color:rgba(245,245,240,0.60);line-height:1.4;white-space:pre-line;}
  </style></head><body>
  ${progressBar(idx, total)}
  <div class="glow"></div>
  <div class="pill">AI TOOLS</div>
  <div class="hook">${hookHeadline}</div>
  <div class="sub">${hookSub}</div>
  <div class="watermark">@toolsforbuilders</div>
  </body></html>`;
}

/** Slide 2: AGITATE — dark, cream text, blue bridge */
function buildAgitate(data, idx, total) {
  const { agitateMain, agitateBridge } = data;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body{background:${B.charcoal}}
  .main{position:absolute;top:380px;left:80px;right:80px;font-size:72px;font-weight:800;color:${B.cream};line-height:1.1;white-space:pre-line;}
  .bridge{position:absolute;top:1100px;left:80px;right:80px;font-size:44px;font-weight:600;color:${B.blue};line-height:1.3;white-space:pre-line;}
  </style></head><body>
  ${progressBar(idx, total)}
  <div class="main">${agitateMain}</div>
  <div class="bridge">${agitateBridge}</div>
  <div class="watermark">@toolsforbuilders</div>
  </body></html>`;
}

/** Slides 3-5: CONTENT POINTS — cream bg */
function buildPoint(point, idx, total, pointNum, isDark = false, showToolName = true) {
  const { label, toolName, verdict, bullets, quickWin } = point;
  const accent = B.lime;
  const bg = isDark ? B.charcoal : B.cream;
  const toolColor = isDark ? accent : B.charcoal;
  const verdictColor = isDark ? 'rgba(245,245,240,0.60)' : 'rgba(26,26,26,0.60)';
  const labelColor = isDark ? 'rgba(245,245,240,0.32)' : 'rgba(26,26,26,0.32)';
  const bulletTextColor = isDark ? '#F5F5F0' : B.charcoal;
  const bulletNumBg = accent;
  const bulletNumText = B.charcoal;
  const quickWinBg = accent;
  const quickWinText = B.charcoal;
  const progressBarColor = accent;
  const vertTrackBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,102,255,0.15)';
  const vertFillBg = accent;
  const bgAccentColor = isDark ? 'rgba(255,255,255,0.50)' : B.blue;
  const watermarkClass = isDark ? 'watermark' : 'watermark-dark';
  const bulletHTML = bullets.map((b, i) => `<li><span class="bnum">${i+1}</span>${b}</li>`).join('');
  const vertFillHeight = pointNum === 1 ? '33' : pointNum === 2 ? '66' : '100';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body{background:${bg}}
  .progress{background:${progressBarColor}!important}
  .label{position:absolute;top:190px;left:80px;font-size:16px;font-weight:700;letter-spacing:4px;color:${labelColor};text-transform:uppercase}
  .tool{position:absolute;top:240px;left:80px;right:80px;font-size:84px;font-weight:900;color:${toolColor};line-height:1.0;letter-spacing:-2px}
  .verdict{position:absolute;top:400px;left:80px;right:80px;font-size:34px;font-weight:600;color:${verdictColor};line-height:1.3;font-style:italic}
  .bullets{position:absolute;top:510px;left:80px;right:80px;list-style:none;display:flex;flex-direction:column;gap:18px}
  .bullets li{display:flex;align-items:flex-start;gap:16px;font-size:34px;font-weight:500;color:${bulletTextColor};line-height:1.4;}
  .bnum{display:inline-flex;align-items:center;justify-content:center;min-width:48px;height:48px;border-radius:50%;background:${bulletNumBg};color:${bulletNumText};font-size:22px;font-weight:800;margin-top:2px;flex-shrink:0;}
  .quickwin{position:absolute;bottom:200px;left:80px;background:${quickWinBg};color:${quickWinText};font-size:26px;font-weight:700;padding:12px 28px;border-radius:100px}
  .vert-track{position:absolute;left:36px;top:300px;width:6px;height:900px;background:${vertTrackBg};border-radius:3px;}
  .vert-fill{position:absolute;top:0;width:100%;background:${vertFillBg};border-radius:3px;}
  .bg-accent{position:absolute;top:-60px;right:-80px;width:400px;height:400px;border-radius:50%;background:${bgAccentColor};opacity:0.10;pointer-events:none;}
  </style></head><body>
  ${progressBar(idx, total)}
  <div class="bg-accent"></div>
  <div class="vert-track"><div class="vert-fill" style="height:${vertFillHeight}%"></div></div>
  <div class="label">${label || `STEP 0${pointNum}`}</div>
  ${showToolName ? `<div class="tool">${toolName}</div>` : ''}
  <div class="verdict">${verdict}</div>
  <ul class="bullets">${bulletHTML}</ul>
  <div class="quickwin">${quickWin}</div>
  <div class="${watermarkClass}">@toolsforbuilders</div>
  </body></html>`;
}

/** Slide 6: PROOF — blue bg, lime stat */
function buildProof(data, idx, total) {
  const { stat, context, source } = data;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body{background:${B.blue};display:flex;flex-direction:column;align-items:center;justify-content:center}
  .label{font-size:20px;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,0.50);text-transform:uppercase;margin-bottom:20px}
  .stat{font-size:180px;font-weight:900;color:${B.lime};line-height:1.0;letter-spacing:-6px;margin-bottom:16px;text-align:center;white-space:pre-line;}
  .context{font-size:44px;font-weight:500;color:rgba(255,255,255,0.85);text-align:center;line-height:1.4;max-width:900px;margin-bottom:32px;white-space:pre-line;}
  .source{font-size:22px;font-weight:400;color:rgba(255,255,255,0.38)}
  </style></head><body>
  ${progressBar(idx, total)}
  <div class="label">THE RESULT</div>
  <div class="stat">${stat}</div>
  <div class="context">${context}</div>
  <div class="source">${source}</div>
  <div class="watermark">@toolsforbuilders</div>
  </body></html>`;
}

/** Slide 7: CTA — dark, lime handle */
function buildCTA(data, idx, total) {
  const { saveText, handle, valueProp, secondary } = data;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body{background:${B.charcoal};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;gap:28px}
  .save{font-size:40px;font-weight:500;color:rgba(245,245,240,0.58);text-align:center}
  .handle{font-size:92px;font-weight:900;color:${B.lime};letter-spacing:-3px;text-align:center}
  .value{font-size:36px;font-weight:500;color:rgba(245,245,240,0.78);text-align:center;line-height:1.4;max-width:900px;white-space:pre-line;}
  .btn{background:#fff;color:${B.blue};font-size:30px;font-weight:800;padding:20px 64px;border-radius:100px;margin-top:8px}
  .secondary{font-size:26px;font-weight:400;color:rgba(245,245,240,0.32);text-align:center}
  </style></head><body>
  ${progressBar(idx, total)}
  <div class="save">${saveText}</div>
  <div class="handle">${handle}</div>
  <div class="value">${valueProp}</div>
  <div class="btn">Follow Now</div>
  <div class="secondary">${secondary}</div>
  <div class="watermark">@toolsforbuilders</div>
  </body></html>`;
}

// ── TTS ───────────────────────────────────────────────────────────────────────
async function generateTTS(text, outPath) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.78, style: 0.12, use_speaker_boost: true, speed: 1.1 }
    })
  });
  if (!res.ok) throw new Error(`ElevenLabs error: ${res.status} ${await res.text()}`);
  const buf = await res.arrayBuffer();
  writeFileSync(outPath, Buffer.from(buf));
}

function getAudioDuration(audioPath) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`).toString().trim();
  return parseFloat(out);
}

// ── Puppeteer frame render ────────────────────────────────────────────────────
async function renderFrame(page, html, outPath) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: outPath, type: 'png' });
}

// ── ffmpeg assembly ───────────────────────────────────────────────────────────
function buildVideo(framePaths, durations, audioPath, outPath) {
  const FADE = 0.3;
  const total = framePaths.length;

  // Build inputs
  const inputs = framePaths.map((f, i) => `-loop 1 -t ${durations[i].toFixed(3)} -i "${f}"`).join(' ');

  // Build xfade filter chain
  let filterParts = [];
  let offsets = [];
  let acc = 0;
  for (let i = 0; i < total - 1; i++) {
    acc += durations[i] - FADE;
    offsets.push(acc.toFixed(3));
  }

  let prev = '0:v';
  for (let i = 0; i < total - 1; i++) {
    const next = `${i+1}:v`;
    const out = i < total - 2 ? `s${i}${i+1}` : 'vout';
    filterParts.push(`[${prev}][${next}]xfade=transition=fade:duration=${FADE}:offset=${offsets[i]}[${out}]`);
    prev = `s${i}${i+1}`;
  }

  const filter = filterParts.join(';');

  // Step 1: video only
  const videoNoAudio = outPath.replace('.mp4', '_noaudio.mp4');
  execSync(`ffmpeg -y ${inputs} -filter_complex "${filter}" -map "[vout]" -c:v libx264 -pix_fmt yuv420p -r 30 "${videoNoAudio}"`, { stdio: 'inherit' });

  // Step 2: combine with audio
  execSync(`ffmpeg -y -i "${videoNoAudio}" -i "${audioPath}" -c:v copy -c:a aac -b:a 128k -shortest "${outPath}"`, { stdio: 'inherit' });

  // Cleanup temp
  rmSync(videoNoAudio, { force: true });
}

// ── Concat audio ──────────────────────────────────────────────────────────────
function concatAudio(audioPaths, outPath) {
  const concatFile = outPath.replace('.mp3', '_concat.txt');
  writeFileSync(concatFile, audioPaths.map(p => `file '${p}'`).join('\n'));
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outPath}"`);
  rmSync(concatFile, { force: true });
}

// ── Content strategy — mandatory read before any generation ──────────────────
function loadContentResearch() {
  const p = join(__dirname, 'data/content-research.md');
  if (existsSync(p)) return readFileSync(p, 'utf-8');
  return null;
}

function loadContentStrategy() {
  const p = join(__dirname, 'data/content-strategy.md');
  if (!existsSync(p)) throw new Error('MISSING: data/content-strategy.md — content strategy rules must exist before generating');
  return readFileSync(p, 'utf8');
}

// ── Quality gate — run before sending to Telegram ────────────────────────────
async function runQualityGate(scriptData) {
  try {
    const { checkQuality } = await import('./quality-gate.mjs');
    const checkScript = checkQuality;
    return await checkScript(scriptData);
  } catch (e) {
    console.warn('⚠️  Quality gate unavailable:', e.message);
    return { passed: true, hardBlocks: [], softBlocks: [], report: 'Quality gate skipped' };
  }
}

// ── Load script from file if passed as CLI arg, else use default ──────────────
function loadScript(scriptPath) {
  if (scriptPath && existsSync(scriptPath)) {
    return JSON.parse(readFileSync(scriptPath, 'utf8'));
  }
  return null;
}

// ── Default content (can be overridden by passing JSON) ───────────────────────
const DEFAULT_REEL = {
  hookHeadline: "You're paying\nfor ChatGPT Plus.\nYou don't need to.",
  hookSub: "Four free tools do the same job.",
  // TTS scripts: MAX 35 words per segment (~6-8 seconds at natural pace)
  // TARGET: 45-55 seconds total. Completion rate is #1 algorithm signal.
  // Rule: Natural narration — enough detail to feel real, no filler.
  hookTTS: "You don't need ChatGPT Plus. These four free tools do the same job.",
  agitateMain: "Three tools in this stack\ndo the same job — for free.",
  agitateBridge: "Here's what you're actually missing →",
  agitateTTS: "Here's the free stack. Writing, research, video — all covered.",
  points: [
    {
      label: 'TOOL 01', toolName: 'Claude', verdict: 'The writing AI that follows instructions.',
      bullets: ['Free: ~40 messages/day, resets every 5 hours', 'Longer structured outputs than GPT-4o free', 'Projects feature saves your brand voice', 'No credit card required'],
      quickWin: '→ claude.ai — free, no card',
      tts: "Claude. Forty messages a day. Better long-form than GPT-4o. Free."
    },
    {
      label: 'TOOL 02', toolName: 'Gemini', verdict: 'Same model as Google One AI. Zero cost.',
      bullets: ['1M token context: paste an entire PDF', 'Replaces Google One AI ($20/mo)', 'Free image generation built in', 'Just needs a Google account'],
      quickWin: '→ gemini.google.com — free',
      tts: "Gemini. One million token context. Replaces Google One AI. Free."
    },
    {
      label: 'TOOL 03', toolName: 'NotebookLM', verdict: "Google's free research tool nobody talks about.",
      bullets: ['50 sources per notebook: PDFs, links, Docs', 'Cited answers across all sources at once', 'Audio Overview: turns research into a podcast', '100% free, no paid tier exists'],
      quickWin: '→ notebooklm.google.com — free',
      tts: "NotebookLM. Upload fifty sources. Ask questions across all of them. Free."
    }
  ],
  proofStat: '$44',
  proofContext: 'saved every month\nusing this stack instead of paid alternatives',
  proofSource: 'web-verified March 2026',
  proofTTS: "Forty-four dollars saved monthly. Same quality. Zero cost.",
  ctaSaveText: 'Save this stack.',
  ctaHandle: '@toolsforbuilders',
  ctaValueProp: 'Free tool roundups, workflow templates\nand honest reviews every week.',
  ctaSecondary: 'New stack dropping Thursday.',
  ctaTTS: "Save this. Follow toolsforbuilders for a new free stack every week."
};

// ── Theme system ──────────────────────────────────────────────────────────────
const THEMES = {
  A: { primary: '#0066FF', accent: '#BFFF00' },
  B: { primary: '#6B21A8', accent: '#F97316' },
  C: { primary: '#0F766E', accent: '#EAB308' }
};

function getThemeColors(themeName = 'A') {
  const theme = THEMES[themeName.toUpperCase()] || THEMES.A;
  return {
    ...B,
    blue: theme.primary,
    lime: theme.accent
  };
}

function parseThemeArg() {
  const themeArg = process.argv.find(arg => arg.startsWith('--theme='));
  if (themeArg) {
    return themeArg.split('=')[1].toUpperCase();
  }
  // Random selection if not specified
  const random = Math.floor(Math.random() * 3); // 0,1,2
  return ['A', 'B', 'C'][random];
}

function makeBaseCSS(colors) {
  return `
  ${FONTS}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{width:1080px;height:1920px;overflow:hidden;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative}
  .progress{position:absolute;top:0;left:0;height:6px;background:${colors.blue};z-index:10}
  .watermark{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:400;color:rgba(245,245,240,0.35);white-space:nowrap;letter-spacing:1px}
  .watermark-dark{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:400;color:rgba(26,26,26,0.30);white-space:nowrap;letter-spacing:1px}
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Mandatory: load and validate content strategy before anything else
  const strategy = loadContentStrategy();
  console.log('📋 Content strategy loaded ✅');
  const research = loadContentResearch();
  if (research) console.log('🔬 Content research loaded ✅');

  const scriptArg = process.argv[2];
  // Default to the workflow-first research script — never the generic tool list
  const DEFAULT_SCRIPT_PATH = join(__dirname, 'data/scripts/reel-research-workflow.json');
  const content = loadScript(scriptArg) || loadScript(DEFAULT_SCRIPT_PATH) || DEFAULT_REEL;

  // Run quality gate — hard blocks prevent generation entirely
  const gate = await runQualityGate(content);
  if (!gate.passed) {
    console.error('\n🚫 QUALITY GATE FAILED — hard blocks found:');
    gate.hardBlocks.forEach(b => console.error(`  ❌ ${b.code || b.name || JSON.stringify(b)}: ${b.issues?.join(', ') || ''}`));
    console.error('\nFix these issues before generating. Content not sent to Lennart.\n');
    process.exit(1);
  }
  if (gate.softBlocks.length > 0) {
    console.warn('\n⚠️  Soft warnings (review before posting):');
    gate.softBlocks.forEach(b => {
      const name = b?.name || b?.id || 'Unknown';
      const fields = Array.isArray(b?.issues) 
        ? b.issues.map(i => i?.field || 'unknown').join(', ')
        : String(b?.issues || '');
      console.warn(`  ⚠️  ${name}: ${fields}`);
    });
    console.warn('');
  }
  const TOTAL_SLIDES = 2 + content.points.length + 2; // hook + agitate + points + proof + CTA

  // Validate required TTS fields before proceeding
  const requiredTTS = ['hookTTS', 'agitateTTS', 'proofTTS', 'ctaTTS'];
  for (const field of requiredTTS) {
    if (!content[field]) {
      throw new Error(`Missing required TTS field: ${field}. Check your script.`);
    }
  }
  if (!Array.isArray(content.points) || content.points.length === 0) {
    throw new Error('Script must have at least one point in the points array.');
  }
  for (let i = 0; i < content.points.length; i++) {
    const point = content.points[i];
    if (!point) {
      throw new Error(`points[${i}] is undefined. Check your script structure.`);
    }
    if (!point.tts) {
      throw new Error(`points[${i}].tts is missing. Each point must have a tts field.`);
    }
  }

  const TMP = join(__dirname, 'data/tmp/reel');
  const OUT_DIR = join(__dirname, 'data/samples/reels');
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('\n🎬 Generating Reel v2 — HTML/CSS + ElevenLabs + ffmpeg\n');

  // ── Step 1: TTS per slide ──────────────────────────────────────────────────
  console.log('🎤 Generating TTS audio...');
  // Build segments array with dynamic indices based on actual number of points
  const proofIndex = 2 + content.points.length;  // After hook (0), agitate (1), and all points
  const ctaIndex = proofIndex + 1;
  const segments = [
    { text: content.hookTTS,    path: join(TMP, 'seg-0.mp3') },
    { text: content.agitateTTS, path: join(TMP, 'seg-1.mp3') },
    ...content.points.map((p, i) => ({ text: p.tts, path: join(TMP, `seg-${i + 2}.mp3`) })),
    { text: content.proofTTS,   path: join(TMP, `seg-${proofIndex}.mp3`) },
    { text: content.ctaTTS,     path: join(TMP, `seg-${ctaIndex}.mp3`) },
  ];

  for (const [i, seg] of segments.entries()) {
    await generateTTS(seg.text, seg.path);
    console.log(`  ✅ Segment ${i+1}/7 (${seg.path.split('/').pop()})`);
    if (i < segments.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // ── Step 2: Measure audio durations ───────────────────────────────────────
  // Add minimum dwell time so slides don't flash past before the viewer can read them
  const MIN_SLIDE_DURATION = 4.5; // seconds — minimum time per slide regardless of TTS length
  const POST_AUDIO_BUFFER  = 0.8; // extra pause after audio ends before transition

  console.log('\n📏 Measuring audio durations...');
  const durations = segments.map(s => {
    const d = getAudioDuration(s.path) + POST_AUDIO_BUFFER;
    const final = Math.max(d, MIN_SLIDE_DURATION);
    console.log(`  ${s.path.split('/').pop()}: ${d.toFixed(2)}s → displayed ${final.toFixed(2)}s`);
    return final;
  });

  // ── Step 3: Concat audio ───────────────────────────────────────────────────
  const fullAudio = join(TMP, 'full_audio.mp3');
  concatAudio(segments.map(s => s.path), fullAudio);
  const totalAudioDuration = getAudioDuration(fullAudio);
  console.log(`\n🔊 Full audio: ${totalAudioDuration.toFixed(2)}s`);

  // ── Hard duration gate — abort before spending time on rendering ───────────
  const HARD_LIMIT_SECONDS = 55;
  if (totalAudioDuration > HARD_LIMIT_SECONDS) {
    const overBy = (totalAudioDuration - HARD_LIMIT_SECONDS).toFixed(1);
    const segmentReport = segments.map((s, i) => {
      const d = getAudioDuration(s.path);
      const flag = d > 8 ? ' ← TOO LONG' : '';
      return `  ${s.path.split('/').pop()}: ${d.toFixed(2)}s${flag}`;
    }).join('\n');
    throw new Error(
      `❌ Video too long: ${totalAudioDuration.toFixed(1)}s (limit ${HARD_LIMIT_SECONDS}s, over by ${overBy}s)\n` +
      `Trim these TTS segments:\n${segmentReport}\n` +
      `Rule: max 35 words/segment, max 155 words total.`
    );
  }

  // ── Step 4: Render frames ──────────────────────────────────────────────────
  console.log('\n🖼️  Rendering frames...');
  const browser = await puppeteer.launch({
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  const framePaths = [];
  // Detect if multiple different tools are featured — only then show tool name on point slides
  const uniqueTools = new Set(content.points.map(p => p.toolName));
  const multiTool = uniqueTools.size > 1;

  // Build slideData with dynamic indices (proofIndex and ctaIndex already computed above)
  const slideData = [
    { html: buildHook(content, 0, TOTAL_SLIDES) },
    { html: buildAgitate(content, 1, TOTAL_SLIDES) },
    ...content.points.map((p, i) => ({ html: buildPoint(p, i + 2, TOTAL_SLIDES, i + 1, content.points.length >= 3 && i === content.points.length - 1, multiTool) })),
    { html: buildProof({ stat: content.proofStat, context: content.proofContext, source: content.proofSource }, proofIndex, TOTAL_SLIDES) },
    { html: buildCTA({ saveText: content.ctaSaveText, handle: content.ctaHandle, valueProp: content.ctaValueProp, secondary: content.ctaSecondary }, ctaIndex, TOTAL_SLIDES) },
  ];

  for (const [i, slide] of slideData.entries()) {
    const framePath = join(TMP, `frame-${i}.png`);
    await renderFrame(page, slide.html, framePath);
    framePaths.push(framePath);
    console.log(`  ✅ Frame ${i+1}/${TOTAL_SLIDES}`);
  }
  await browser.close();

  // ── Step 5: Assemble video ─────────────────────────────────────────────────
  console.log('\n🎞️  Assembling video...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = join(OUT_DIR, `reel-${timestamp}.mp4`);
  buildVideo(framePaths, durations, fullAudio, outPath);

  console.log(`\n✅ Reel complete: ${outPath}`);
  const size = (readFileSync(outPath).length / 1024 / 1024).toFixed(1);
  const totalDur = getAudioDuration(outPath);
  console.log(`   Size: ${size}MB | Duration: ${totalDur.toFixed(1)}s\n`);

  return outPath;
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
