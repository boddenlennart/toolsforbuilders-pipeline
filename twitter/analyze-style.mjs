#!/usr/bin/env node
/**
 * analyze-style.mjs
 * Weekly scan: reads timeline, extracts style patterns from top creators,
 * distills voice lessons into memory/style-observations.md
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const execFileAsync = promisify(execFile);

// Read latest timeline
const timelinePath = '/root/.openclaw/workspace/memory/timeline-latest.json';
if (!existsSync(timelinePath)) {
  console.log('No timeline data found. Run morning-intelligence first.');
  process.exit(0);
}

const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const tweets = [...(timeline.targetTweets || []), ...(timeline.generalFeed || []), ...(timeline.tweets || [])].slice(0, 60);

if (tweets.length === 0) {
  console.log('No tweets in timeline.');
  process.exit(0);
}

// Primary style references — accounts Lennart explicitly admires
const primaryAccounts = ['bramk', 'BitPaine', 'JeffBooth', 'LynAldenContact', 'jackmallers', 'LawrenceLepard'];

// Secondary — also worth absorbing style from
const secondaryAccounts = [
  'pete_rizzo_', 'jimmysong', 'hodlonaut', 'real_vijay',
  'NickSzabo4', 'CaitlinLong_', 'jameslavish', 'stephanlivera',
  'TomerStrolight', 'Dennis_Porter_', 'CarlBMenger', 'BitcoinPierre',
  'nic_carter', '100trillionUSD', 'CorySwan', 'SimplyBitcoin',
];

const targetAccounts = [...primaryAccounts, ...secondaryAccounts];

const relevant = tweets.filter(t => {
  const handle = (typeof t.author === 'string' ? t.author : t.author?.handle || t.username || '').replace('@','').toLowerCase();
  return targetAccounts.some(a => a.toLowerCase() === handle);
});

if (relevant.length < 5) {
  console.log('Not enough relevant tweets for style analysis. Need fresh timeline.');
  process.exit(0);
}

// Sort: primary accounts first
relevant.sort((a, b) => {
  const aHandle = (typeof a.author === 'string' ? a.author : a.username || '').toLowerCase();
  const bHandle = (typeof b.author === 'string' ? b.author : b.username || '').toLowerCase();
  const aIsPrimary = primaryAccounts.some(p => p.toLowerCase() === aHandle);
  const bIsPrimary = primaryAccounts.some(p => p.toLowerCase() === bHandle);
  return (bIsPrimary ? 1 : 0) - (aIsPrimary ? 1 : 0);
});

const tweetSample = relevant.slice(0, 30).map(t => {
  const handle = typeof t.author === 'string' ? t.author : (t.author?.handle || t.username || 'unknown');
  return `@${handle} (${t.likes || t.engagement?.likes || 0} likes): "${t.text}"`;
}).join('\n\n');

const existing = existsSync('/root/.openclaw/workspace/memory/style-observations.md')
  ? readFileSync('/root/.openclaw/workspace/memory/style-observations.md', 'utf8').slice(-1500)
  : '';

const message = `You are analyzing the writing style of top Bitcoin/macro creators on X to extract voice patterns for @btcmaxistheway.

PRIMARY REFERENCES (accounts Lennart explicitly admires most — weight these heavily): @bramk, @BitPaine, @JeffBooth, @LynAldenContact, @jackmallers, @LawrenceLepard

The account's non-negotiable rules: no dashes of any kind, no staccato fragments, no AI openers, no sycophancy, no forced Bitcoin pivots. Max 275 chars per tweet. Builds to a point. Dry wit.

Here are recent high-engagement tweets from accounts Lennart follows and admires:

${tweetSample}

Previous style observations (don't repeat these):
${existing}

Analyze and extract:
1. Sentence rhythm patterns that feel human (how do the best writers open? how do they close?)
2. How they handle humor — dry, self-aware, not forced
3. How they signal expertise without sounding like a textbook
4. Specific phrases or constructions worth borrowing (not copying)
5. What makes their best tweets feel like a real person had a real thought

Output as markdown for memory/style-observations.md. Be specific — quote actual tweets as examples. No generic writing advice.

Format:
## Style Observations — [date]
[your analysis]`;

console.log(`Analyzing style from ${relevant.length} relevant tweets...`);

try {
  const { stdout } = await execFileAsync('openclaw', [
    'agent', '--local', '--agent', 'main',
    '--message', message,
  ], { timeout: 180000, maxBuffer: 2 * 1024 * 1024 });

  const block = stdout.trim();
  const outPath = '/root/.openclaw/workspace/memory/style-observations.md';
  
  if (existsSync(outPath)) {
    const current = readFileSync(outPath, 'utf8');
    writeFileSync(outPath, current + '\n\n---\n\n' + block);
  } else {
    writeFileSync(outPath, '# Style Observations — @btcmaxistheway\n\nDistilled from timeline analysis. Updated weekly.\n\n---\n\n' + block);
  }

  console.log('Style observations written to memory/style-observations.md');
} catch(e) {
  console.error('Style analysis failed:', e.message);
}
