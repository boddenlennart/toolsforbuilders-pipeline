/**
 * @toolsforbuilders — Professional carousel generator v4
 * 9/10 agency-quality design: dark cover, two-column tool cards, savings callouts
 */
import { createCanvas, registerFont, loadImage } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// ── Logo loader (real brand logos, fallback to styled badge) ─────────────────
const LOGO_DIR = new URL('./assets/logos/', import.meta.url).pathname;
const logoCache = {};
async function getLogo(name) {
  if (logoCache[name]) return logoCache[name];
  const paths = [`${LOGO_DIR}${name}-fav.png`, `${LOGO_DIR}${name}.png`];
  for (const p of paths) {
    if (existsSync(p)) {
      try { logoCache[name] = await loadImage(p); return logoCache[name]; } catch(e) {}
    }
  }
  return null;
}

async function drawLogo(ctx, name, cx, cy, size) {
  const img = await getLogo(name);
  if (img) {
    // Draw real logo in a white circle
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size/2, 0, Math.PI*2);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.clip();
    ctx.drawImage(img, cx - size/2, cy - size/2, size, size);
    ctx.restore();
    // Subtle border
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, size/2, 0, Math.PI*2); ctx.stroke();
  } else {
    // Fallback: styled initial badge
    ctx.fillStyle = '#888888';
    ctx.beginPath(); ctx.arc(cx, cy, size/2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(size*0.38)}px Brand`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.charAt(0).toUpperCase(), cx, cy);
  }
}

// ── Fonts ────────────────────────────────────────────────────────────────────
registerFont('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',    { family: 'Brand', weight: 'bold' });
registerFont('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', { family: 'Brand', weight: 'normal' });

// ── Brand ────────────────────────────────────────────────────────────────────
const B = {
  blue:     '#0066FF',
  blueDark: '#0044CC',
  cream:    '#F5F5F0',
  charcoal: '#1A1A1A',
  lime:     '#BFFF00',
  red:      '#FF3B3B',
  white:    '#FFFFFF',
};
const SIZE = 1080;

// ── Helpers ──────────────────────────────────────────────────────────────────
function hex(h, alpha = 1) {
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, strokeW = 2) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
}

function pill(ctx, cx, cy, text, fontSize, bgColor, textColor, hPad = 24, vPad = 12) {
  ctx.font = `bold ${fontSize}px Brand`;
  const tw = ctx.measureText(text).width;
  const pw = tw + hPad * 2, ph = fontSize + vPad * 2;
  const px = cx - pw / 2, py = cy - ph / 2;
  roundRect(ctx, px, py, pw, ph, ph / 2, bgColor, null);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  return { x: px, y: py, w: pw, h: ph };
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function badge(ctx, cx, cy, r, bgColor, initials, fontSize) {
  ctx.fillStyle = bgColor;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = B.white;
  ctx.font = `bold ${fontSize}px Brand`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(initials, cx, cy);
}

function save(canvas, path) {
  mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(path, canvas.toBuffer('image/png'));
  console.log(`  ✅ ${path} (${Math.round(canvas.toBuffer('image/png').length/1024)}KB)`);
}

// ── SLIDE 1: Dark dramatic cover ─────────────────────────────────────────────
async function drawCover(outPath) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Charcoal bg
  ctx.fillStyle = B.charcoal;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle blue noise texture
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = hex(B.blue, 0.04);
    ctx.fillRect(Math.random()*SIZE, Math.random()*SIZE, 2, 2);
  }

  // "AI TOOLS ⚡" pill top-center
  pill(ctx, SIZE/2, 100, 'AI TOOLS ⚡', 24, B.blue, B.lime, 24, 12);

  // ── Strikethrough price → $0 ──────────────────────────────────────────────
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  // Crossed-out price
  ctx.font = `bold 90px Brand`;
  ctx.fillStyle = hex(B.cream, 0.6);
  const oldPrice = '$44/mo';
  ctx.fillText(oldPrice, SIZE/2, 280);
  const oldW = ctx.measureText(oldPrice).width;
  ctx.fillStyle = B.red;
  ctx.fillRect(SIZE/2 - oldW/2, 245, oldW, 7);

  // Big $0
  ctx.font = `bold 160px Brand`;
  ctx.fillStyle = B.lime;
  ctx.fillText('$0', SIZE/2, 450);

  // Headline
  ctx.font = `bold 52px Brand`;
  ctx.fillStyle = B.cream;
  ctx.fillText('The Free AI Stack', SIZE/2, 520);

  // Date label
  ctx.font = `normal 22px Brand`;
  ctx.fillStyle = hex(B.cream, 0.45);
  ctx.fillText('Updated 03/2026', SIZE/2, 560);

  // ── Tool logos row ────────────────────────────────────────────────────────
  const coverTools = [
    { logoKey: 'claude',     label: 'Claude'     },
    { logoKey: 'gemini',     label: 'Gemini'     },
    { logoKey: 'notebooklm', label: 'NotebookLM' },
    { logoKey: 'capcut',     label: 'CapCut'     },
  ];
  const badgeR = 40, badgeGap = 52, badgeY = 660;
  const totalW = coverTools.length * (badgeR*2) + (coverTools.length-1) * badgeGap;
  let bx = (SIZE - totalW) / 2 + badgeR;
  for (const t of coverTools) {
    await drawLogo(ctx, t.logoKey, bx, badgeY, badgeR * 2);
    ctx.font = `normal 20px Brand`; ctx.fillStyle = hex(B.cream, 0.75);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(t.label, bx, badgeY + badgeR + 10);
    bx += badgeR*2 + badgeGap;
  }

  // ── Swipe CTA ─────────────────────────────────────────────────────────────
  ctx.font = `normal 26px Brand`; ctx.fillStyle = hex(B.cream, 0.5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Swipe to see each tool →', SIZE/2, 1020);

  // Divider line
  ctx.fillStyle = hex(B.blue, 0.6);
  ctx.fillRect(SIZE/2 - 80, 862, 160, 2);

  // Swipe prompt
    // Watermark
  ctx.font = `bold 22px Brand`;
  ctx.fillStyle = hex(B.cream, 0.55);
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('@toolsforbuilders', SIZE - 55, SIZE - 30);

  save(canvas, outPath);
}

// ── SLIDES 2-5: Two-column tool cards ────────────────────────────────────────
async function drawToolSlide(tool, outPath) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const MID = 700; // column split (65:35)

  // LEFT: cream bg
  ctx.fillStyle = B.cream;
  ctx.fillRect(0, 0, MID, SIZE);

  // RIGHT: blue gradient
  const grad = ctx.createLinearGradient(MID, 0, MID, SIZE);
  grad.addColorStop(0, B.blue); grad.addColorStop(1, B.blueDark);
  ctx.fillStyle = grad;
  ctx.fillRect(MID, 0, SIZE - MID, SIZE);

  // Top blue accent bar (full width)
  ctx.fillStyle = B.blue;
  ctx.fillRect(0, 0, SIZE, 8);

  // Slide counter pill (top-right of LEFT column)
  const pillText = `${tool.num}/${tool.total}`;
  ctx.font = `bold 28px Brand`;
  const ptw = ctx.measureText(pillText).width;
  const pw = ptw + 32, ph = 44;
  const px = MID - 30 - pw, py = 25;
  roundRect(ctx, px, py, pw, ph, ph/2, B.blue, null);
  ctx.fillStyle = B.cream;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pillText, px + pw/2, py + ph/2);

  const PAD = 75;

  // Real brand logo in circle, top-left
  const logoSize = 64;
  const logoCX = PAD + logoSize/2, logoCY = 100 + logoSize/2;
  await drawLogo(ctx, tool.logoKey || tool.initials.toLowerCase(), logoCX, logoCY, logoSize);

  // Accent bar — tight left of logo, tool's brand color
  ctx.fillStyle = tool.color;
  ctx.fillRect(PAD - 14, 90, 6, logoSize + 16);

  // Tool name — right of logo, vertically centered
  const displayName = tool.tool.replace(/ Free$/, '').replace(/ Self-Hosted$/, '');
  ctx.font = `bold 50px Brand`;
  ctx.fillStyle = B.charcoal;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(displayName, PAD + logoSize + 20, logoCY);

  // Plan tag pill — below logo, left-aligned at PAD
  ctx.font = `bold 19px Brand`;
  const planW = ctx.measureText(tool.plan).width;
  const planPH = 34, planPW = planW + 28;
  roundRect(ctx, PAD, 180, planPW, planPH, planPH/2, B.lime, null);
  ctx.fillStyle = B.charcoal;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tool.plan, PAD + 14, 180 + planPH/2);

  // Replaces callout box — two-line layout to prevent overflow
  const boxX = PAD, boxY = 295, boxW = MID - PAD - 25, boxH = 96;
  roundRect(ctx, boxX, boxY, boxW, boxH, 12, hex(B.red, 0.07), B.red, 2);
  // Line 1: "Replaces: [tool name]" with strikethrough
  const line1Y = boxY + 35;
  ctx.font = `bold 22px Brand`; ctx.fillStyle = B.charcoal;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Replaces:', boxX + 16, line1Y);
  const repLabelW = ctx.measureText('Replaces: ').width;
  ctx.font = `normal 22px Brand`; ctx.fillStyle = B.red;
  // Truncate tool name if too wide
  let repName = tool.replaces;
  const maxRepW = boxW - 32 - repLabelW;
  while (ctx.measureText(repName).width > maxRepW && repName.length > 4) repName = repName.slice(0, -1);
  if (repName !== tool.replaces) repName = repName.trim() + '…';
  ctx.fillText(repName, boxX + 16 + repLabelW, line1Y);
  // Strikethrough line 1
  const repNameW = ctx.measureText(repName).width;
  ctx.fillRect(boxX + 16 + repLabelW, line1Y - 8, repNameW, 2);
  // Line 2: cost in red bold
  const line2Y = boxY + 70;
  ctx.font = `bold 22px Brand`; ctx.fillStyle = B.red;
  const line2Text = tool.replacesCost.startsWith('$') ? tool.replacesCost + ' → you pay $0' : 'Saves you ' + tool.saves;
  ctx.fillText(line2Text, boxX + 16 + repLabelW, line2Y);

  // Bullet points — tighter spacing, bigger font
  let by = 415;
  for (const b of tool.bullets) {
    const textY = by + 28;
    ctx.fillStyle = B.blue;
    ctx.beginPath(); ctx.arc(PAD + 8, textY - 6, 7, 0, Math.PI*2); ctx.fill();
    ctx.font = `normal 31px Brand`; ctx.fillStyle = B.charcoal;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const lines = wrapText(ctx, b, MID - PAD - 55);
    lines.forEach((line, i) => ctx.fillText(line, PAD + 28, textY + i * 38));
    by += 70 + (lines.length - 1) * 38;
  }

  // BOTTOM STAT BAR — fills dead space, adds real value
  const barY = 740;
  ctx.fillStyle = hex(B.blue, 0.08);
  ctx.fillRect(PAD, barY, MID - PAD - 25, 200);
  // Left border accent
  ctx.fillStyle = B.blue;
  ctx.fillRect(PAD, barY, 5, 200);

  ctx.font = `bold 20px Brand`; ctx.fillStyle = hex(B.charcoal, 0.6);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('BEST FOR', PAD + 22, barY + 36);

  ctx.font = `bold 28px Brand`; ctx.fillStyle = B.charcoal;
  ctx.fillText(tool.bestFor, PAD + 22, barY + 72);

  ctx.font = `bold 20px Brand`; ctx.fillStyle = hex(B.charcoal, 0.6);
  ctx.fillText('DIFFICULTY', PAD + 22, barY + 112);

  // Difficulty dots
  const diffMap = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
  const diff = diffMap[tool.difficulty] || 2;
  const dotCY = barY + 148; // single Y for both dots and text
  for (let d = 0; d < 3; d++) {
    ctx.fillStyle = d < diff ? B.blue : hex(B.charcoal, 0.2);
    ctx.beginPath(); ctx.arc(PAD + 31 + d * 28, dotCY, 9, 0, Math.PI*2); ctx.fill();
  }
  ctx.font = `normal 22px Brand`; ctx.fillStyle = hex(B.charcoal, 0.7);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tool.difficulty, PAD + 31 + 3*28 + 14, dotCY);

  // Watermark left col
  ctx.font = `normal 20px Brand`; ctx.fillStyle = hex(B.charcoal, 0.35);
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('@toolsforbuilders', MID - 20, SIZE - 22);

  // RIGHT COL: ghost initials
  ctx.save();
  ctx.font = `bold 260px Brand`; ctx.fillStyle = hex(B.white, 0.08);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tool.initials, MID + (SIZE-MID)/2, SIZE/2);
  ctx.restore();

  // Right panel: QUICK START — actionable tip, replaces wasted savings number
  const panelCX = MID + (SIZE - MID) / 2;
  const panelW = SIZE - MID;
  const panelPad = 28;

  // "QUICK START" label
  ctx.font = `bold 18px Brand`; ctx.fillStyle = B.lime;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '2px';
  ctx.fillText('QUICK START', panelCX, 370);
  ctx.letterSpacing = '0px';

  // Divider line under label
  ctx.strokeStyle = hex(B.lime, 0.3); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(MID + panelPad, 382); ctx.lineTo(SIZE - panelPad, 382); ctx.stroke();

  // Quick start tip — word-wrapped into the panel
  const tip = tool.quickStart || 'Open the tool. Try one task today.';
  ctx.font = `normal 26px Brand`; ctx.fillStyle = hex(B.white, 0.92);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';

  // Word wrap into ~panelW - 2*panelPad width
  const maxW = panelW - panelPad * 2;
  const words = tip.split(' ');
  let lines = [], line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);

  const lineH = 34;
  const totalH = lines.length * lineH;
  let ty = 410 - totalH / 2 + 20;
  for (const l of lines) { ctx.fillText(l, panelCX, ty); ty += lineH; }

  // Savings pill at the bottom of panel — small, honest
  if (tool.saves && tool.saves !== '$0' && tool.saves.startsWith('$')) {
    const savesLabel = 'Saves ' + tool.saves;
    ctx.font = `bold 20px Brand`;
    const sw = ctx.measureText(savesLabel).width + 28;
    const sy = 560, sh = 36;
    roundRect(ctx, panelCX - sw/2, sy, sw, sh, sh/2, hex(B.lime, 0.15), hex(B.lime, 0.5), 1);
    ctx.fillStyle = B.lime; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(savesLabel, panelCX, sy + sh/2);
  }

  save(canvas, outPath);
}

// ── SLIDE 6: CTA ─────────────────────────────────────────────────────────────
async function drawCTA(num, total, outPath) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, B.blue); grad.addColorStop(1, B.blueDark);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

  // Lime accent line
  ctx.fillStyle = B.lime;
  ctx.fillRect(SIZE/2 - 50, 265, 100, 6);

  // Main CTA headline
  ctx.font = `bold 66px Brand`; ctx.fillStyle = B.cream;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Save this. Your stack.', SIZE/2, 360);

  // Value box
  const bx = 130, by = 415, bw = SIZE - 260, bh = 260;
  roundRect(ctx, bx, by, bw, bh, 20, hex(B.white, 0.12), hex(B.white, 0.2), 1);

  ctx.font = `bold 27px Brand`; ctx.fillStyle = B.lime;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Following @toolsforbuilders gets you:', SIZE/2, by + 52);

  const benefits = [
    '✓  Weekly free tool roundups',
    '✓  Automation workflows you can copy',
    '✓  Stack updates as tools change',
  ];
  ctx.font = `normal 28px Brand`; ctx.fillStyle = B.cream;
  benefits.forEach((b, i) => {
    ctx.textAlign = 'left';
    ctx.fillText(b, bx + 50, by + 100 + i * 55);
  });

  // CTA button
  const btnX = 230, btnY = 710, btnW = SIZE - 460, btnH = 72;
  roundRect(ctx, btnX, btnY, btnW, btnH, 36, B.cream, null);
  ctx.font = `bold 32px Brand`; ctx.fillStyle = B.blue;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Follow @toolsforbuilders', SIZE/2, btnY + btnH/2);

  // Save prompt
  ctx.font = `normal 25px Brand`; ctx.fillStyle = hex(B.cream, 0.6);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('💾  Save this before you forget', SIZE/2, 848);

  // Counter pill bottom
  pill(ctx, SIZE/2, 930, `${num}/${total}`, 24, hex(B.white, 0.15), hex(B.cream, 0.7), 20, 10);

  save(canvas, outPath);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const OUT = 'data/samples/final/carousel-1';

// Content: Opus rewrite + web-verified facts (03/2026)
// Savings: $44/mo honest total (Claude $20 + Gemini $20 + CapCut $4)
const tools = [
  { num:2, total:6, logoKey:'claude',     tool:'Claude',     color:'#CC785C', initials:'C',   plan:'FREE PLAN', replaces:'ChatGPT Plus',          replacesCost:'$20/mo', saves:'$20/mo', bestFor:'Writing, editing, long-form drafts',         difficulty:'Easy', bullets:['~40 msgs/day free — enough for a full content workflow','Longer, structured outputs per message than GPT-4o free','5h reset windows: spread use across morning and evening'],    quickStart:'Paste a caption draft. Ask: make this punchier.' },
  { num:3, total:6, logoKey:'gemini',     tool:'Gemini',     color:'#1A73E8', initials:'G',   plan:'FREE PLAN', replaces:'Google One AI Premium', replacesCost:'$20/mo', saves:'$20/mo', bestFor:'Research, long docs, web questions',          difficulty:'Easy', bullets:['1M token context — paste a full PDF and ask questions','Replaces Google One AI: same Gemini model, no subscription','Best free option for working with large documents'],          quickStart:'Upload a competitor PDF. Ask: what is their core offer?' },
  { num:4, total:6, logoKey:'notebooklm', tool:'NotebookLM', color:'#34A853', initials:'NLM', plan:'100% FREE', replaces:'ChatGPT Plus for docs',  replacesCost:'$20/mo', saves:'$0',     bestFor:'Synthesizing multiple sources fast',          difficulty:'Easy', bullets:['50 sources per notebook — ask questions across all at once','Audio Overview: turns sources into a 10-min AI podcast','Free with Google account — no paid plan needed'],             quickStart:'Upload 3 competitor articles. Ask: what gap do they miss?' },
  { num:5, total:6, logoKey:'capcut',     tool:'CapCut',     color:'#1C1C1C', initials:'CC',  plan:'FREE PLAN', replaces:'InShot Pro',            replacesCost:'$4/mo',  saves:'$4/mo',  bestFor:'Reels, TikToks, short-form video',            difficulty:'Easy', bullets:['Auto-captions in 60+ languages — one tap, accurate','AI background removal on mobile, no green screen needed','Standard exports: no watermark (premium templates: watermark)'], quickStart:'Record 60 sec talking. Auto-caption it. Post as a Reel.' },
];

async function main() {
  console.log('\n🎨 Generating @toolsforbuilders carousel v4 — The $0 AI Stack\n');
  await drawCover(`${OUT}/slide-1.png`);
  for (const t of tools) await drawToolSlide(t, `${OUT}/slide-${t.num}.png`);
  await drawCTA(6, 6, `${OUT}/slide-6.png`);
  console.log('\n✅ All slides generated.\n');
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
