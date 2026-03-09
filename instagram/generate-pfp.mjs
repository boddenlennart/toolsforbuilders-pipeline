import { createCanvas, registerFont } from 'canvas';
import { writeFileSync } from 'fs';

// Try to register fonts
const fonts = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
];
for (const f of fonts) {
  try { registerFont(f, { family: 'Brand', weight: 'bold' }); break; } catch(e) {}
}

const SIZE = 512;
const BLUE = '#0066FF';
const CREAM = '#F5F5F0';
const CHARCOAL = '#1A1A1A';

// === OPTION 2A: TB Lettermark — Blue on Cream ===
{
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Cream background with subtle border
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Blue accent corner squares (top-left, bottom-right)
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, 40, 40);
  ctx.fillRect(SIZE-40, SIZE-40, 40, 40);

  // TB Lettermark
  ctx.fillStyle = BLUE;
  ctx.font = 'bold 220px Brand, DejaVu Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TB', SIZE/2, SIZE/2 + 10);

  // Subtle underline
  ctx.fillStyle = BLUE;
  ctx.fillRect(SIZE/2 - 100, SIZE/2 + 120, 200, 6);

  writeFileSync('/tmp/pfp-option2a-tb-cream.png', canvas.toBuffer('image/png'));
  console.log('✅ Option 2A: TB on Cream');
}

// === OPTION 2B: TB Lettermark — Cream on Blue ===
{
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  // Full blue background
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, '#0066FF');
  grad.addColorStop(1, '#0044CC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Cream TB
  ctx.fillStyle = CREAM;
  ctx.font = 'bold 220px Brand, DejaVu Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TB', SIZE/2, SIZE/2 + 10);

  // Cream underline
  ctx.fillStyle = CREAM;
  ctx.fillRect(SIZE/2 - 100, SIZE/2 + 120, 200, 6);

  writeFileSync('/tmp/pfp-option2b-tb-blue.png', canvas.toBuffer('image/png'));
  console.log('✅ Option 2B: TB on Blue');
}

// === OPTION 3: Abstract Robot/Builder Icon ===
{
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  // Blue gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, '#0066FF');
  grad.addColorStop(1, '#0044CC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2;

  // Helper: rounded rect
  function roundRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // Robot head (rounded square)
  roundRect(cx - 100, 100, 200, 170, 28, CREAM);

  // Antenna
  ctx.fillStyle = CREAM;
  ctx.fillRect(cx - 6, 60, 12, 45);
  ctx.beginPath();
  ctx.arc(cx, 55, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#BFFF00'; // lime accent
  ctx.fill();

  // Eyes (blue circles on cream head)
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.arc(cx - 38, 185, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 38, 185, 22, 0, Math.PI * 2); ctx.fill();

  // Eye shine
  ctx.fillStyle = CREAM;
  ctx.beginPath(); ctx.arc(cx - 30, 177, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 46, 177, 8, 0, Math.PI * 2); ctx.fill();

  // Mouth (grid of dots = circuit)
  ctx.fillStyle = BLUE;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(cx - 48 + i * 24, 237, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body (rounded rect)
  roundRect(cx - 110, 285, 220, 130, 20, CREAM);

  // Body circuit lines
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx - 60, 320); ctx.lineTo(cx + 60, 320); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 320); ctx.lineTo(cx, 360); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 40, 360); ctx.lineTo(cx + 40, 360); ctx.stroke();

  // Circuit dots
  ctx.fillStyle = BLUE;
  for (const [x, y] of [[cx-60,320],[cx+60,320],[cx-40,360],[cx+40,360],[cx,360]]) {
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }

  // Arms
  roundRect(cx - 160, 290, 40, 90, 12, CREAM);
  roundRect(cx + 120, 290, 40, 90, 12, CREAM);

  // Legs
  roundRect(cx - 80, 425, 50, 65, 12, CREAM);
  roundRect(cx + 30, 425, 50, 65, 12, CREAM);

  writeFileSync('/tmp/pfp-option3-robot.png', canvas.toBuffer('image/png'));
  console.log('✅ Option 3: Robot mascot');
}

console.log('All done.');
