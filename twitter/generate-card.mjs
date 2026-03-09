#!/usr/bin/env node
/**
 * generate-card.mjs — Generate quote cards for @btcmaxistheway
 *
 * Usage:
 *   node generate-card.mjs --text="Your quote here" --out=card.png
 *   node generate-card.mjs --text="Quote" --type=thread --handle="@author"
 *
 * Types: quote (default), stat, thread-hook
 */

import pkg from '/root/.openclaw/workspace/life-dash-test/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the HTML for a quote card
 */
function buildCardHtml({ text, handle = '', type = 'quote', accent = '#f7931a' }) {
  const isLong = text.length > 140;
  const fontSize = isLong ? '28px' : text.length > 80 ? '34px' : '40px';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1200px;
    height: 675px;
    background: #0a0a0a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    overflow: hidden;
  }

  .card {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px;
  }

  /* Subtle grid texture */
  .card::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(247,147,26,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(247,147,26,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  /* Top accent line */
  .accent-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, ${accent}, transparent);
  }

  /* Bottom accent line */
  .accent-line-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(247,147,26,0.3), transparent);
  }

  /* Corner marks */
  .corner {
    position: absolute;
    width: 24px;
    height: 24px;
    border-color: rgba(247,147,26,0.4);
    border-style: solid;
  }
  .corner-tl { top: 24px; left: 24px; border-width: 2px 0 0 2px; }
  .corner-tr { top: 24px; right: 24px; border-width: 2px 2px 0 0; }
  .corner-bl { bottom: 24px; left: 24px; border-width: 0 0 2px 2px; }
  .corner-br { bottom: 24px; right: 24px; border-width: 0 2px 2px 0; }

  .quote-mark {
    font-size: 120px;
    color: rgba(247,147,26,0.12);
    line-height: 0.8;
    margin-bottom: 20px;
    font-family: Georgia, serif;
    align-self: flex-start;
    margin-left: -10px;
  }

  .text {
    color: #f0f0f0;
    font-size: ${fontSize};
    font-weight: 500;
    line-height: 1.5;
    text-align: left;
    width: 100%;
    letter-spacing: -0.3px;
    position: relative;
    z-index: 1;
  }

  /* Highlight key phrases — first sentence stronger */
  .text em {
    color: ${accent};
    font-style: normal;
    font-weight: 600;
  }

  .footer {
    position: absolute;
    bottom: 36px;
    right: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 2;
  }

  .handle {
    color: rgba(240,240,240,0.4);
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0.5px;
  }

  .btc-symbol {
    width: 28px;
    height: 28px;
    background: ${accent};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000;
    font-weight: 900;
    font-size: 16px;
  }

  ${type === 'thread-hook' ? `
  .thread-badge {
    position: absolute;
    top: 36px;
    right: 48px;
    background: rgba(247,147,26,0.1);
    border: 1px solid rgba(247,147,26,0.3);
    color: ${accent};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.5px;
    padding: 6px 14px;
    border-radius: 3px;
    text-transform: uppercase;
  }` : ''}
</style>
</head>
<body>
<div class="card">
  <div class="accent-line"></div>
  <div class="accent-line-bottom"></div>
  <div class="corner corner-tl"></div>
  <div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div>
  <div class="corner corner-br"></div>

  ${type === 'thread-hook' ? '<div class="thread-badge">Thread</div>' : ''}

  <div class="quote-mark">"</div>
  <div class="text">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>

  <div class="footer">
    <span class="handle">${handle || '@btcmaxistheway'}</span>
    <div class="btc-symbol">₿</div>
  </div>
</div>
</body>
</html>`;
}

/**
 * Render a card to PNG
 * @param {object} opts
 * @param {string} opts.text - Quote text
 * @param {string} opts.outPath - Output file path
 * @param {string} opts.type - 'quote' | 'thread-hook'
 * @param {string} opts.handle - Twitter handle
 * @returns {Promise<string>} - Output path
 */
export async function generateCard({ text, outPath, type = 'quote', handle = '@btcmaxistheway' }) {
  const html = buildCardHtml({ text, handle, type });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 675 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // Small delay for font rendering
  await page.waitForTimeout(200);

  const resolved = outPath || path.join(__dirname, `card-${Date.now()}.png`);
  await page.screenshot({ path: resolved, type: 'png' });
  await browser.close();

  return resolved;
}

// CLI
if (process.argv[1]?.endsWith('generate-card.mjs')) {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const [k,...v] = a.slice(2).split('='); return [k, v.join('=')]; })
  );

  const text = args.text || 'The rules of Bitcoin cannot be changed. That\'s not a bug — it\'s the entire point.';
  const outPath = path.resolve(args.out || `/tmp/btc-card-${Date.now()}.png`);
  const type = args.type || 'quote';

  console.log('Generating card...');
  const result = await generateCard({ text, outPath, type });
  console.log('✅ Card saved:', result);
}
