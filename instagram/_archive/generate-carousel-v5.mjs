/**
 * @toolsforbuilders — Carousel generator v5
 * HTML/CSS → Puppeteer → PNG (1080×1080px)
 */
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'data/samples/final/carousel-1');
mkdirSync(OUT, { recursive: true });

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = { blue:'#0066FF', cream:'#F5F5F0', charcoal:'#1A1A1A', lime:'#BFFF00', red:'#FF3B3B' };

// ── Logos ─────────────────────────────────────────────────────────────────────
function logoB64(filename) {
  const p = join(__dirname, 'assets/logos', filename);
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`;
}

// ── Tool data ─────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    num:2, total:6, logoKey:'claude', tool:'Claude', color:'#CC785C',
    plan:'FREE PLAN', replaces:'ChatGPT Plus', replacesCost:'$20/mo', saves:'$20/mo',
    bestFor:'Writing, editing, drafts', difficulty:'Easy',
    bullets:[
      'Free tier: ~40 messages per day, resets every 5 hours',
      'Longer and more structured outputs than GPT-4o on the free tier',
      'Projects feature remembers your brand voice across sessions',
      'Handles multi-step instructions better than GPT-4o free tier',
      'Integrates with Zapier and Make via Claude Pro for automation',
    ],
    quickStart:'Paste a caption draft. Ask: make this punchier, under 150 chars.',
    workflows:['Instagram captions','Email newsletters','Blog first drafts'],
  },
  {
    num:3, total:6, logoKey:'gemini', tool:'Gemini', color:'#1A73E8',
    plan:'FREE PLAN', replaces:'Google One AI Premium', replacesCost:'$20/mo', saves:'$20/mo',
    bestFor:'Research, long docs, web questions', difficulty:'Easy',
    bullets:[
      '1M token context: paste an entire book and ask questions about it',
      'Same base model as Google One AI ($20/mo) at zero cost',
      'Free image generation built in via Gemini Imagen on free tier',
      'Google Workspace sync to summarise your Gmail and Docs instantly',
      'Gemini 2.0 Flash on free tier: released Feb 2026, fastest free model',
    ],
    quickStart:'Upload a competitor PDF. Ask: what pain points do they not solve?',
    workflows:['Market research','Content ideation','Google Workspace summaries'],
  },
  {
    num:4, total:6, logoKey:'notebooklm', tool:'NotebookLM', color:'#34A853',
    plan:'100% FREE', replaces:'ChatGPT Plus for docs', replacesCost:'$20/mo', saves:'$0',
    bestFor:'Synthesizing multiple sources', difficulty:'Easy',
    bullets:[
      'Upload up to 50 sources per notebook: PDFs, web links, Google Docs',
      'Ask questions and get cited answers across all your sources at once',
      'Audio Overview turns your research into a 10-minute AI podcast',
      'Generates study guides, FAQs and timelines from your source material',
      'Google Drive sync so you never manually upload docs you already have',
    ],
    quickStart:'Upload 3 competitor sites as web links. Ask: what gap do they all miss?',
    workflows:['Book & course research','Client proposal prep','Competitor analysis'],
  },
  {
    num:5, total:6, logoKey:'capcut', tool:'CapCut', color:'#1C1C1C',
    plan:'FREE PLAN', replaces:'InShot Pro', replacesCost:'$4/mo', saves:'$4/mo',
    bestFor:'Reels, TikToks, short-form video', difficulty:'Easy',
    bullets:[
      'Auto-captions in 60+ languages with one tap, surprisingly accurate',
      'AI background removal on mobile without a green screen',
      'Direct TikTok export so you never re-upload between apps',
      'Works on desktop and mobile: edit on laptop, finish on phone',
      'Standard exports have no watermark (only premium templates do)',
    ],
    quickStart:'Record 60 sec talking head. Auto-caption, trim silences, post.',
    workflows:['Instagram Reels','TikTok content','Talking-head videos'],
  },
];

// ── Local Inter font (base64, no network required) ───────────────────────────
function fontB64(filename) {
  const p = join(__dirname, 'assets/fonts', filename);
  return readFileSync(p).toString('base64');
}

const FONTS = `
  @font-face { font-family:'Inter'; font-weight:400; src:url('data:font/woff2;base64,${fontB64('inter-400.woff2')}') format('woff2'); }
  @font-face { font-family:'Inter'; font-weight:500; src:url('data:font/woff2;base64,${fontB64('inter-400.woff2')}') format('woff2'); }
  @font-face { font-family:'Inter'; font-weight:600; src:url('data:font/woff2;base64,${fontB64('inter-700.woff2')}') format('woff2'); }
  @font-face { font-family:'Inter'; font-weight:700; src:url('data:font/woff2;base64,${fontB64('inter-700.woff2')}') format('woff2'); }
  @font-face { font-family:'Inter'; font-weight:800; src:url('data:font/woff2;base64,${fontB64('inter-800.woff2')}') format('woff2'); }
  @font-face { font-family:'Inter'; font-weight:900; src:url('data:font/woff2;base64,${fontB64('inter-900.woff2')}') format('woff2'); }
`;

// ── Base CSS (injected into every slide) ──────────────────────────────────────
const BASE = `
  ${FONTS}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1080px; height: 1080px; overflow: hidden;
         font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
`;

// ── COVER ─────────────────────────────────────────────────────────────────────
function buildCover(logos) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body { background:${B.charcoal}; display:flex; flex-direction:column; align-items:center;
         justify-content:center; position:relative; gap:0; }
  .glow { position:absolute; top:0; left:0; right:0; height:320px;
          background:radial-gradient(ellipse at 50% -10%, rgba(0,102,255,0.20) 0%, transparent 70%);
          pointer-events:none; }
  .badge { background:${B.blue}; color:${B.lime}; font-size:15px; font-weight:700;
           letter-spacing:2.5px; padding:10px 28px; border-radius:100px;
           margin-bottom:40px; text-transform:uppercase; }
  .old-wrap { position:relative; display:inline-block; margin-bottom:2px; }
  .old { font-size:76px; font-weight:800; color:rgba(245,245,240,0.38); line-height:1; }
  .strike { position:absolute; top:50%; left:-6px; right:-6px; height:6px;
            background:${B.red}; border-radius:3px; transform:translateY(-50%); }
  .zero { font-size:160px; font-weight:900; color:${B.lime}; line-height:0.9;
          letter-spacing:-6px; margin-bottom:14px; }
  .headline { font-size:44px; font-weight:800; color:${B.cream}; letter-spacing:-1px; margin-bottom:6px; }
  .date { font-size:16px; font-weight:400; color:rgba(245,245,240,0.36); margin-bottom:44px; }
  .logos { display:flex; gap:40px; align-items:flex-start; }
  .logo-item { display:flex; flex-direction:column; align-items:center; gap:10px; }
  .circle { width:76px; height:76px; border-radius:50%; background:#fff;
            display:flex; align-items:center; justify-content:center; overflow:hidden;
            box-shadow:0 4px 20px rgba(0,0,0,0.35); }
  .circle img { width:64px; height:64px; object-fit:contain; }
  .logo-label { font-size:14px; font-weight:500; color:rgba(245,245,240,0.62); }
  .swipe { position:absolute; bottom:34px; font-size:17px; font-weight:500;
           color:rgba(245,245,240,0.28); }
  </style></head><body>
  <div class="glow"></div>
  <div class="badge">AI TOOLS ⚡</div>
  <div class="old-wrap"><span class="old">$44/mo</span><div class="strike"></div></div>
  <div class="zero">$0</div>
  <div class="headline">The Free AI Stack</div>
  <div class="date">Updated 03/2026</div>
  <div class="logos">
    <div class="logo-item"><div class="circle"><img src="${logos.claude}"/></div><span class="logo-label">Claude</span></div>
    <div class="logo-item"><div class="circle"><img src="${logos.gemini}"/></div><span class="logo-label">Gemini</span></div>
    <div class="logo-item"><div class="circle"><img src="${logos.notebooklm}"/></div><span class="logo-label">NotebookLM</span></div>
    <div class="logo-item"><div class="circle"><img src="${logos.capcut}"/></div><span class="logo-label">CapCut</span></div>
  </div>
  <div class="swipe">Swipe to see each tool →</div>
  </body></html>`;
}

// ── TOOL SLIDE ────────────────────────────────────────────────────────────────
function buildTool(tool, logos) {
  const savesPill = tool.saves && tool.saves !== '$0'
    ? `<div class="saves-pill">Saves ${tool.saves}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body { display:flex; background:${B.cream}; }
  /* LEFT */
  .left { width:700px; height:1080px; background:${B.cream}; padding:52px 40px 44px 56px;
          display:flex; flex-direction:column; position:relative; }
  .counter { position:absolute; top:24px; right:24px; background:rgba(26,26,26,0.07);
             color:#666; font-size:13px; font-weight:600; padding:5px 13px; border-radius:100px; }
  .tool-header { display:flex; align-items:center; gap:18px; margin-bottom:26px; }
  .logo-sm { width:68px; height:68px; border-radius:50%; background:#fff;
             display:flex; align-items:center; justify-content:center; overflow:hidden;
             box-shadow:0 2px 12px rgba(0,0,0,0.10); flex-shrink:0; }
  .logo-sm img { width:56px; height:56px; object-fit:contain; }
  .name-block { display:flex; flex-direction:column; gap:8px; }
  .tool-name { font-size:44px; font-weight:800; color:${B.charcoal}; letter-spacing:-1.5px; line-height:1; }
  .plan-pill { display:inline-block; background:${B.lime}; color:${B.charcoal};
               font-size:12px; font-weight:700; letter-spacing:1px;
               padding:5px 16px; border-radius:100px; align-self:flex-start; }
  .rep-box { background:rgba(255,59,59,0.06); border:1.5px solid rgba(255,59,59,0.22);
             border-radius:10px; padding:13px 16px; margin-bottom:24px; }
  .rep-top { font-size:10px; font-weight:700; letter-spacing:2px; color:${B.red};
             text-transform:uppercase; margin-bottom:5px; }
  .rep-name { font-size:18px; font-weight:700; color:${B.charcoal};
              text-decoration:line-through; text-decoration-color:${B.red};
              text-decoration-thickness:2px; }
  .rep-cost { font-size:16px; font-weight:700; color:${B.red}; margin-left:8px; }
  .bullets { list-style:none; display:flex; flex-direction:column; gap:9px;
             flex:1; padding-bottom:18px; }
  .bullets li { font-size:16px; font-weight:500; color:${B.charcoal};
                line-height:1.35; padding-left:22px; position:relative; }
  .bullets li::before { content:'→'; position:absolute; left:0; color:${B.blue}; font-weight:700; }
  .footer { display:flex; align-items:center; gap:18px; padding:14px 18px;
            background:rgba(26,26,26,0.05); border-radius:12px; }
  .foot-item { display:flex; flex-direction:column; gap:5px; }
  .foot-label { font-size:10px; font-weight:700; letter-spacing:2px;
                color:rgba(26,26,26,0.38); text-transform:uppercase; }
  .foot-value { font-size:14px; font-weight:600; color:${B.charcoal}; }
  .foot-div { width:1px; height:30px; background:rgba(26,26,26,0.12); }
  .dots { display:flex; gap:6px; align-items:center; }
  .dot { width:11px; height:11px; border-radius:50%; background:rgba(26,26,26,0.15); }
  .dot.on { background:${B.blue}; }
  /* RIGHT */
  .right { width:380px; height:1080px; background:${B.charcoal};
           border-left:4px solid ${tool.color};
           display:flex; flex-direction:column; align-items:center;
           justify-content:center; padding:44px 28px; gap:18px; position:relative; }
  .qs-label { font-size:11px; font-weight:700; letter-spacing:3px;
              color:${B.lime}; text-transform:uppercase; }
  .qs-line { width:44px; height:2px; background:rgba(191,255,0,0.28); border-radius:1px; }
  .qs-tip { font-size:19px; font-weight:600; color:rgba(245,245,240,0.88);
            text-align:center; line-height:1.5; margin-bottom:8px; }
  .wf-label { font-size:10px; font-weight:700; letter-spacing:2px;
              color:rgba(245,245,240,0.38); text-transform:uppercase; margin-top:16px; }
  .wf-tags { display:flex; flex-direction:column; gap:8px; align-items:center; margin-top:6px; }
  .wf-tag { background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15);
            color:rgba(245,245,240,0.80); font-size:14px; font-weight:600;
            padding:6px 16px; border-radius:100px; white-space:nowrap; }
  .saves-pill { position:absolute; bottom:40px; background:rgba(191,255,0,0.10);
                border:1px solid rgba(191,255,0,0.38); color:${B.lime};
                font-size:14px; font-weight:700; padding:7px 20px;
                border-radius:100px; white-space:nowrap; }
  </style></head><body>
  <div class="left">
    <div class="counter">${tool.num}/${tool.total}</div>
    <div class="tool-header">
      <div class="logo-sm"><img src="${logos[tool.logoKey]}"/></div>
      <div class="name-block">
        <div class="tool-name">${tool.tool}</div>
        <div class="plan-pill">${tool.plan}</div>
      </div>
    </div>
    <div class="rep-box">
      <div class="rep-top">Replaces</div>
      <span class="rep-name">${tool.replaces}</span><span class="rep-cost">${tool.replacesCost}</span>
    </div>
    <ul class="bullets">
      ${tool.bullets.map(b => `<li>${b}</li>`).join('\n      ')}
    </ul>
    <div class="footer">
      <div class="foot-item">
        <span class="foot-label">BEST FOR</span>
        <span class="foot-value">${tool.bestFor}</span>
      </div>
      <div class="foot-div"></div>
      <div class="foot-item">
        <span class="foot-label">DIFFICULTY</span>
        <div class="dots"><span class="dot on"></span><span class="dot"></span><span class="dot"></span></div>
      </div>
    </div>
  </div>
  <div class="right">
    <div class="qs-label">QUICK START</div>
    <div class="qs-line"></div>
    <div class="qs-tip">${tool.quickStart}</div>
    <div class="wf-label">USE IT FOR</div>
    <div class="wf-tags">
      ${(tool.workflows||[]).map(w => `<div class="wf-tag">${w}</div>`).join('\n      ')}
    </div>
    ${savesPill}
  </div>
  </body></html>`;
}

// ── CTA SLIDE ─────────────────────────────────────────────────────────────────
function buildCTA() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE}
  body { background:${B.blue}; display:flex; flex-direction:column; align-items:center;
         justify-content:center; padding:80px 80px 100px; gap:24px; position:relative; }
  .counter { position:absolute; top:24px; right:24px; background:rgba(255,255,255,0.15);
             color:#fff; font-size:13px; font-weight:600; padding:5px 13px; border-radius:100px; }
  .icon { font-size:56px; }
  .headline { font-size:54px; font-weight:900; color:#fff; text-align:center;
              letter-spacing:-2px; line-height:1.1; }
  .sub { font-size:19px; font-weight:400; color:rgba(255,255,255,0.75); margin-bottom:4px; }
  .benefits { display:flex; flex-direction:column; gap:16px; width:100%; max-width:720px; margin-bottom:8px; align-items:center; }
  .benefit { font-size:19px; font-weight:500; color:rgba(255,255,255,0.88); text-align:center; line-height:1.4; }
  .benefit::before { content:'· '; color:rgba(255,255,255,0.50); font-weight:700; }
  .btn { background:#fff; color:${B.blue}; font-size:21px; font-weight:800;
         padding:20px 56px; border-radius:100px; margin-top:8px; letter-spacing:-0.5px; }
  </style></head><body>
  <div class="counter">6/6</div>
  <div class="icon">💾</div>
  <div class="headline">Save this.<br>Your stack.</div>
  <div class="sub">Updated monthly as tools change.</div>
  <div class="benefits">
    <div class="benefit">Monthly free tool roundups — what changed, what's new</div>
    <div class="benefit">Workflow templates you can copy and use today</div>
    <div class="benefit">Honest comparisons — no affiliate links, no hype</div>
  </div>
  <div class="btn">Follow @toolsforbuilders</div>
  </body></html>`;
}

// ── Render helper ─────────────────────────────────────────────────────────────
async function render(page, html, outPath) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: outPath, type: 'png' });
  console.log(`  ✅ ${outPath.split('/').pop()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🎨 Generating carousel v5 — HTML/CSS + Puppeteer\n');

  const logos = {
    claude:     logoB64('claude-fav.png'),
    gemini:     logoB64('gemini-fav.png'),
    notebooklm: logoB64('notebooklm-fav.png'),
    capcut:     logoB64('capcut-fav.png'),
  };

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  await render(page, buildCover(logos),   join(OUT, 'slide-1.png'));
  for (const t of TOOLS) await render(page, buildTool(t, logos), join(OUT, `slide-${t.num}.png`));
  await render(page, buildCTA(),          join(OUT, 'slide-6.png'));

  await browser.close();
  console.log('\n✅ Done.\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
