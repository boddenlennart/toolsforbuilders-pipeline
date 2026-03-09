import { createCanvas, registerFont } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const FONTS = [
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', { family: 'Brand', weight: 'bold' }],
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', { family: 'Brand', weight: 'normal' }],
];
for (const [path, opts] of FONTS) {
  try { registerFont(path, opts); } catch(e) {}
}

const BLUE = '#0066FF', CREAM = '#F5F5F0', CHARCOAL = '#1A1A1A';
const SIZE = 1080, PAD = 80;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawContent(slide, num, total, outPath) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (slide.type === 'cover') {
    // Blue gradient bg
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, '#0066FF'); grad.addColorStop(1, '#0044CC');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

    // Date pill
    ctx.font = `normal 26px Brand`; ctx.textBaseline = 'middle';
    const dateText = `Updated ${slide.date}`;
    const dw = ctx.measureText(dateText).width + 32;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    const pillH = 44, pillY = SIZE/2 - 120;
    const pillX = (SIZE - dw) / 2;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY - pillH/2, dw, pillH, 22);
    ctx.fill();
    ctx.fillStyle = CREAM; ctx.textAlign = 'center';
    ctx.fillText(dateText, SIZE/2, pillY);

    // Headline
    ctx.font = `bold 82px Brand`; ctx.fillStyle = CREAM;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const hLines = wrapText(ctx, slide.headline, 840);
    const lineH = 96;
    let hy = SIZE/2 - ((hLines.length-1) * lineH)/2;
    for (const l of hLines) { ctx.fillText(l, SIZE/2, hy); hy += lineH; }

    // Subheadline
    ctx.font = `normal 36px Brand`; ctx.fillStyle = 'rgba(245,245,240,0.82)';
    const sLines = wrapText(ctx, slide.subheadline, 760);
    let sy = hy + 30;
    for (const l of sLines) { ctx.fillText(l, SIZE/2, sy); sy += 44; }

    // Watermark
    ctx.font = `normal 24px Brand`; ctx.fillStyle = CREAM;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('@toolsforbuilders', PAD, SIZE - PAD + 20);

  } else if (slide.type === 'cta') {
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, '#0066FF'); grad.addColorStop(1, '#0044CC');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

    // Accent line above
    ctx.fillStyle = 'rgba(245,245,240,0.4)';
    ctx.fillRect((SIZE-200)/2, SIZE/2 - 100, 200, 4);

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `bold 58px Brand`; ctx.fillStyle = CREAM;
    ctx.fillText(slide.headline, SIZE/2, SIZE/2);
    ctx.font = `normal 36px Brand`;
    ctx.fillStyle = 'rgba(245,245,240,0.82)';
    ctx.fillText(slide.subheadline, SIZE/2, SIZE/2 + 60);

  } else {
    // Content slide
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, SIZE, SIZE);

    // Top accent bar
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, SIZE, 8);

    // Slide counter pill
    const pillText = `${num}/${total}`;
    ctx.font = `bold 30px Brand`;
    const tw = ctx.measureText(pillText).width;
    const pH = 48, pW = tw + 40, pInset = 40;
    const pX = SIZE - pInset - pW, pY = pInset;
    ctx.fillStyle = BLUE;
    ctx.beginPath(); ctx.roundRect(pX, pY, pW, pH, pH/2); ctx.fill();
    ctx.fillStyle = CREAM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pillText, pX + pW/2, pY + pH/2);

    // Section headline
    ctx.font = `bold 54px Brand`; ctx.fillStyle = CHARCOAL;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const hLines = wrapText(ctx, slide.headline, 920);
    let hy = 175;
    for (const l of hLines) { ctx.fillText(l, PAD, hy); hy += 65; }

    // Blue accent line under headline
    ctx.fillStyle = BLUE; ctx.fillRect(PAD, hy + 8, 100, 5);

    // Bullets
    let by = hy + 65;
    const bullets = slide.bullets || [];
    for (const bullet of bullets) {
      const textY = by + 38; // baseline
      // Circle centered on text baseline
      ctx.fillStyle = BLUE;
      ctx.beginPath(); ctx.arc(PAD + 7, textY - 10, 7, 0, Math.PI * 2); ctx.fill();
      // Text
      ctx.fillStyle = CHARCOAL; ctx.font = `normal 38px Brand`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const bLines = wrapText(ctx, bullet, SIZE - PAD - 120);
      for (let j = 0; j < bLines.length; j++) {
        ctx.fillText(bLines[j], PAD + 40, textY + j * 50);
      }
      by += 95 + (bLines.length - 1) * 50;
    }

    // Watermark
    ctx.font = `normal 22px Brand`; ctx.globalAlpha = 0.45;
    ctx.fillStyle = CHARCOAL; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('@toolsforbuilders', SIZE - PAD, SIZE - PAD + 20);
    ctx.globalAlpha = 1;
  }

  writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`  ✅ ${outPath}`);
}

const slides = [
  { type: 'cover', headline: 'The $0 AI Stack', subheadline: 'Free tools that replaced my $200/mo stack', date: '03/2026' },
  { type: 'content', headline: '1. Claude Free (Sonnet 4.6)', bullets: ['Opus-level writing quality', 'Resets every 5h — free forever', 'Perfect for captions & scripts'] },
  { type: 'content', headline: '2. n8n (Self-hosted)', bullets: ['Unlimited automation workflows', 'No monthly fees ever', 'More powerful than Zapier'] },
  { type: 'content', headline: '3. Gemini Free', bullets: ['Image gen + research in one place', 'Replaces Midjourney for basic use', '1M token context window'] },
  { type: 'cta', headline: 'Follow @toolsforbuilders', subheadline: 'Daily AI tools & automation tips' },
];

const outDir = '/root/.openclaw/workspace/scripts/instagram/data/samples/carousels/v3/carousel-fix';
mkdirSync(outDir, { recursive: true });

slides.forEach((slide, i) => {
  const num = i + 1;
  drawContent(slide, num, slides.length, `${outDir}/slide-${num}.png`);
});
console.log('\nDone!');
