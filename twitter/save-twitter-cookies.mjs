#!/usr/bin/env node
/**
 * save-twitter-cookies.mjs
 * Opens a Playwright browser, lets you log in to Twitter/X manually,
 * then saves the cookies to .twitter-cookies.json for screenshot use.
 *
 * Usage: node scripts/twitter/save-twitter-cookies.mjs
 * Run this once, then re-run every ~30 days when session expires.
 */

import pkg from '/root/.openclaw/workspace/life-dash-test/node_modules/playwright/index.js';
const { chromium } = pkg;
import { writeFileSync } from 'fs';

console.log('Opening browser — log in to X/Twitter, then press Enter here when done.');
console.log('The browser window will open on the host machine if display is available.\n');

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://x.com/login');

console.log('Waiting for you to log in... (press Enter in this terminal when done)');
await new Promise(resolve => process.stdin.once('data', resolve));

const cookies = await context.cookies();
writeFileSync('/root/.openclaw/workspace/.twitter-cookies.json', JSON.stringify(cookies, null, 2));
console.log(`Saved ${cookies.length} cookies to .twitter-cookies.json`);

await browser.close();
process.exit(0);
