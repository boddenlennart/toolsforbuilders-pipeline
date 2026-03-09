#!/usr/bin/env node
/**
 * screenshot-source.mjs
 * Screenshots a source URL (tweet, article, etc.) for attaching to pipeline items.
 * Usage: node screenshot-source.mjs --url https://x.com/... --out /path/to/out.jpg
 */

import pkg from '/root/.openclaw/workspace/life-dash-test/node_modules/playwright/index.js';
const { chromium } = pkg;
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { parseArgs } from 'util';

const { values } = parseArgs({
  options: {
    url:  { type: 'string' },
    out:  { type: 'string' },
    type: { type: 'string', default: 'auto' }, // auto | tweet | article
  }
});

if (!values.url || !values.out) {
  console.error('Usage: --url <url> --out <path>');
  process.exit(1);
}

mkdirSync(dirname(values.out), { recursive: true });

const isTweet = values.url.includes('x.com') || values.url.includes('twitter.com');

const browser = await chromium.launch();

try {
  if (isTweet) {
    // Use saved cookies for authenticated browsing
    const cookiePath = '/root/.openclaw/workspace/.twitter-cookies.json';
    const { existsSync, readFileSync } = await import('fs');

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Load cookies if available
    if (existsSync(cookiePath)) {
      const cookies = JSON.parse(readFileSync(cookiePath, 'utf8'));
      await context.addCookies(cookies);
    } else {
      console.warn('No Twitter cookies found at', cookiePath);
      console.warn('Run: node scripts/twitter/save-twitter-cookies.mjs to set up login');
    }

    const page = await context.newPage();
    await page.goto(values.url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Try to find the tweet article and crop to it
    const tweetEl = await page.$('article[data-testid="tweet"]');
    if (tweetEl) {
      const box = await tweetEl.boundingBox();
      if (box) {
        await page.screenshot({
          path: values.out, type: 'jpeg', quality: 92,
          clip: { x: 0, y: box.y - 8, width: 1280, height: box.height + 16 },
        });
      } else {
        await tweetEl.screenshot({ path: values.out, type: 'jpeg', quality: 92 });
      }
    } else {
      // Fallback: crop top of page
      await page.screenshot({ path: values.out, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1280, height: 700 } });
    }
    await page.close();

  } else {
    // Article — screenshot top portion
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await context.newPage();
    await page.goto(values.url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: values.out, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await page.close();
  }

  console.log('Screenshot saved:', values.out);
} catch (e) {
  console.error('Screenshot failed:', e.message);
  process.exit(1);
} finally {
  await browser.close();
}
