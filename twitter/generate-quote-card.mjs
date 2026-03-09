#!/usr/bin/env node
/**
 * generate-quote-card.mjs
 * Renders a quote card image (1200x675, Twitter-optimised) using Playwright.
 * Usage: node generate-quote-card.mjs --text "Your quote" --out /path/to/output.jpg
 */

import pkg from '/root/.openclaw/workspace/life-dash-test/node_modules/playwright/index.js';
const { chromium } = pkg;
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { parseArgs } from 'util';

const { values } = parseArgs({
  options: {
    text:    { type: 'string' },
    out:     { type: 'string' },
    accent:  { type: 'string', default: '#F7931A' }, // Bitcoin orange
    author:  { type: 'string', default: '@btcmaxistheway' },
  }
});

if (!values.text || !values.out) {
  console.error('Usage: --text "quote" --out /path/to/out.jpg');
  process.exit(1);
}

const text = values.text;
const accent = values.accent;
const author = values.author;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 675px;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Georgia', 'Times New Roman', serif;
    overflow: hidden;
  }
  .card {
    width: 100%; height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 100px;
    position: relative;
  }
  .accent-line {
    width: 48px;
    height: 3px;
    background: ${accent};
    margin-bottom: 40px;
    border-radius: 2px;
  }
  .quote {
    font-size: ${text.length > 140 ? '32px' : text.length > 80 ? '38px' : '46px'};
    color: #ffffff;
    line-height: 1.5;
    text-align: center;
    letter-spacing: -0.01em;
    font-weight: 400;
    max-width: 900px;
  }
  .author {
    margin-top: 44px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 18px;
    color: ${accent};
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* Subtle corner marks */
  .corner { position: absolute; width: 20px; height: 20px; border-color: #ffffff18; border-style: solid; }
  .tl { top: 28px; left: 28px; border-width: 1px 0 0 1px; }
  .tr { top: 28px; right: 28px; border-width: 1px 1px 0 0; }
  .bl { bottom: 28px; left: 28px; border-width: 0 0 1px 1px; }
  .br { bottom: 28px; right: 28px; border-width: 0 1px 1px 0; }
</style>
</head>
<body>
<div class="card">
  <div class="corner tl"></div>
  <div class="corner tr"></div>
  <div class="corner bl"></div>
  <div class="corner br"></div>
  <div class="accent-line"></div>
  <div class="quote">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  <div class="author">${author}</div>
</div>
</body>
</html>`;

mkdirSync(dirname(values.out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 675 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: values.out, type: 'jpeg', quality: 95 });
await browser.close();

console.log('Quote card saved:', values.out);
