#!/usr/bin/env node
/**
 * deep-style-analysis.mjs
 * Fetches ~50 recent tweets per primary reference account via xAI x_search,
 * then runs a deep style analysis and writes to memory/style-observations.md
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const secrets = readFileSync('/root/.openclaw/workspace/.env.secrets', 'utf8');
const xaiKey = secrets.split('\n').find(l => l.startsWith('XAI_API_KEY='))?.split('=').slice(1).join('=').trim();

const PRIMARY_ACCOUNTS = ['bramk', 'BitPaine', 'JeffBooth', 'LynAldenContact', 'jackmallers', 'LawrenceLepard'];

async function fetchTweetsForAccount(handle) {
  console.log(`  Fetching tweets for @${handle}...`);
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${xaiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{
          role: 'user',
          content: `Search X for the 30 most recent tweets from @${handle}. Return ONLY a JSON array of objects with fields: text, likes, date. No commentary, no markdown, just valid JSON array.`
        }],
        tools: [{ type: 'live_search' }],
        tool_choice: 'auto',
        max_tokens: 4000,
      }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const tweets = JSON.parse(match[0]);
      console.log(`    Got ${tweets.length} tweets`);
      return { handle, tweets };
    }
    console.log(`    Could not parse tweets for @${handle}`);
    return { handle, tweets: [] };
  } catch(e) {
    console.error(`    Failed for @${handle}: ${e.message}`);
    return { handle, tweets: [] };
  }
}

async function runDeepAnalysis(allData) {
  const tweetBlocks = allData.map(({ handle, tweets }) => {
    if (tweets.length === 0) return `@${handle}: No tweets retrieved`;
    const sample = tweets.slice(0, 25).map(t => 
      `  [${t.likes || 0} likes] "${t.text}"`
    ).join('\n');
    return `### @${handle} (${tweets.length} tweets)\n${sample}`;
  }).join('\n\n');

  const existing = existsSync('/root/.openclaw/workspace/memory/style-observations.md')
    ? readFileSync('/root/.openclaw/workspace/memory/style-observations.md', 'utf8').slice(-500)
    : '';

  console.log('\nRunning deep style analysis with Claude...');
  
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const message = `You are doing a deep writing style analysis of 6 Bitcoin/macro creators on X. The goal: extract specific, actionable voice patterns for @btcmaxistheway to improve its writing.

PRIMARY REFERENCES — these are the 6 accounts Lennart (@btcmaxistheway) explicitly admires and wants to learn from:
- @bramk (Bram Kanstein)
- @BitPaine 
- @JeffBooth (Jeff Booth, "The Price of Tomorrow")
- @LynAldenContact (Lyn Alden, macro analyst)
- @jackmallers (Jack Mallers, Strike CEO)
- @LawrenceLepard (Lawrence Lepard, sound money advocate)

ACCOUNT: @btcmaxistheway
- Non-negotiable rules: zero dashes of any kind, no staccato fragments, no AI openers, no sycophancy, builds to a point, dry wit, 275 char max per tweet
- Goal: develop a distinct voice that feels adjacent to this reference group without mimicking any one of them

TWEET DATA:
${tweetBlocks}

Produce a deep, specific style analysis covering:

1. **Opening patterns** — how does each writer start? What constructions appear repeatedly? Which work best and why?
2. **Closing patterns** — how do they land the point? Twist, restatement, open question, silence?
3. **Sentence rhythm** — long/short mix, where do they breathe, what's their default clause structure?
4. **Vocabulary register** — technical vs accessible, where do they use precise terminology vs plain speech?
5. **Humor and wit** — specific examples of what works, the mechanism behind each
6. **What makes their BEST tweets different from their average ones** — concrete examples
7. **Constructions to borrow** — 10 specific patterns with examples and how to adapt them
8. **Constructions to avoid** — what falls flat and why
9. **The voice synthesis** — if you had to describe the @btcmaxistheway voice that emerges from absorbing all six of these, what does it sound like? Write 3 example tweets in that synthesized voice.

Be specific. Quote actual tweets. This is a writing workshop, not a content strategy memo.

Format as markdown for memory/style-observations.md with date header: ## Deep Style Analysis — ${new Date().toISOString().slice(0,10)}`;

  const { stdout } = await execFileAsync('openclaw', [
    'agent', '--local', '--agent', 'main',
    '--model', 'anthropic/claude-opus-4-5',
    '--message', message,
  ], { timeout: 600000, maxBuffer: 4 * 1024 * 1024 });

  return stdout.trim();
}

// Main
console.log('=== Deep Style Analysis ===');
console.log(`Fetching tweets from ${PRIMARY_ACCOUNTS.length} primary accounts via xAI...\n`);

const allData = [];
for (const handle of PRIMARY_ACCOUNTS) {
  const result = await fetchTweetsForAccount(handle);
  allData.push(result);
  await new Promise(r => setTimeout(r, 1000)); // rate limit courtesy
}

const totalTweets = allData.reduce((sum, d) => sum + d.tweets.length, 0);
console.log(`\nTotal tweets collected: ${totalTweets}`);

if (totalTweets < 10) {
  console.log('Not enough data collected. Check xAI API key or try again.');
  process.exit(1);
}

const analysis = await runDeepAnalysis(allData);

const outPath = '/root/.openclaw/workspace/memory/style-observations.md';
if (existsSync(outPath)) {
  appendFileSync(outPath, '\n\n---\n\n' + analysis);
} else {
  writeFileSync(outPath, '# Style Observations — @btcmaxistheway\n\nDistilled from xAI-powered timeline analysis.\n\n---\n\n' + analysis);
}

console.log('\n✅ Deep style analysis complete. Written to memory/style-observations.md');
console.log(`Total tweets analyzed: ${totalTweets}`);
