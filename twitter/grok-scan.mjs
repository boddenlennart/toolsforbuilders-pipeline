/**
 * grok-scan.mjs - Core xAI wrapper for Twitter scanning
 * Uses Grok's live X search to find high-engagement posts worth responding to
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load secrets from .env.secrets
function loadSecrets() {
  const secretsPath = path.join(__dirname, '..', '..', '.env.secrets');
  const content = fs.readFileSync(secretsPath, 'utf-8');
  const secrets = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      secrets[match[1].trim()] = match[2].trim();
    }
  }
  return secrets;
}

const secrets = loadSecrets();

// Initialize xAI client
const xai = new OpenAI({
  apiKey: secrets.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

/**
 * Run a Grok scan for Twitter opportunities.
 *
 * Two modes:
 * 1. realTweets mode: pass pre-fetched tweets (real IDs guaranteed). Grok analyzes only, no searching.
 * 2. search mode: pass accounts + hoursBack. Grok searches X (IDs may be unreliable).
 *
 * @param {Object} options
 * @param {Array}  options.realTweets       - Pre-fetched tweet objects with real IDs (preferred)
 * @param {string[]} options.accounts       - Twitter handles (search mode fallback)
 * @param {number} options.hoursBack        - Hours to search back (search mode)
 * @param {string} options.scanType         - 'morning' | 'afternoon' | 'evening' | 'manual'
 * @param {number} options.maxOpportunities - Max opportunities to return
 */
export async function runGrokScan({ realTweets, accounts, hoursBack, scanType = 'manual', maxOpportunities = 5 }) {

  // === MODE 1: real tweets pre-fetched — Grok analyzes content only ===
  if (realTweets && realTweets.length > 0) {
    const tweetList = realTweets.map((t, i) =>
      `[${i+1}] tweet_id=${t.tweet_id} | url=${t.tweet_url} | @${t.author} (${t.followers} followers)\n    Text: ${t.text}\n    Engagement: ${t.likes} likes, ${t.retweets} RT, ${t.replies} replies`
    ).join('\n\n');

    const prompt = `You are analyzing pre-fetched tweets to find the best reply opportunities for @btcmaxistheway.

These tweets are REAL — fetched directly from the Twitter API. The tweet_id and url fields are verified and accurate. Do NOT modify them.

TWEETS TO ANALYZE:
${tweetList}

YOUR TASK:
1. Identify the ${maxOpportunities} best reply opportunities. Criteria:
   - High engagement (likes > 20 OR replies > 5)
   - Substantive content worth engaging with (Bitcoin, macro, money, tech, philosophy, regulation, markets)
   - Skip: pure memes, personal life posts, politics unrelated to money/freedom, spam

2. For each opportunity, extract the factual content signals:
   - What specific claim or position does this tweet take?
   - Is it making an argument, sharing data, or expressing an opinion?
   - What would a thoughtful reply engage with?

3. Identify 1-2 proactive thread topics based on what's trending in these tweets right now.

IMPORTANT: Copy tweet_id and tweet_url EXACTLY as provided above — do not alter them.

Return ONLY this JSON (no markdown, no other text):
{
  "opportunities": [
    {
      "type": "reply",
      "tweet_id": "exact id from above",
      "tweet_url": "exact url from above",
      "author": "handle without @",
      "text_preview": "tweet text",
      "engagement": { "likes": 0, "replies": 0 },
      "content_signals": "what this tweet specifically argues or claims",
      "urgency": "high or normal"
    }
  ],
  "proactive_topics": [
    {
      "topic": "specific topic",
      "rationale": "why relevant now based on these tweets",
      "suggested_approach": "3-5 sentence thread outline"
    }
  ]
}`;

    const startTime = Date.now();
    const response = await xai.chat.completions.create({
      model: 'grok-4-1-fast-reasoning',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    });

    const elapsed = Date.now() - startTime;
    const raw = response.choices[0]?.message?.content || '{}';
    const usage = response.usage || {};
    const costEstimate = ((usage.prompt_tokens || 0) * 0.20 + (usage.completion_tokens || 0) * 0.50) / 1_000_000;

    let parsed = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || raw);
    } catch (e) {
      console.error('Failed to parse Grok response:', e.message);
    }

    const opportunities = (parsed.opportunities || []).map(opp => ({
      ...opp,
      tweet_id: opp.tweet_id || null,
      tweet_url: opp.tweet_url || null,
    }));

    console.log(`  Grok analysis: ${opportunities.length} opportunities | ${elapsed}ms | ~$${costEstimate.toFixed(4)}`);
    return { opportunities, proactiveTopics: parsed.proactive_topics || [], costEstimate, tokensUsed: usage.total_tokens || 0 };
  }

  // === MODE 2: search mode (fallback) ===
  const accountsList = accounts.map(a => a.startsWith('@') ? a.slice(1) : a).join(', ');
  
  const prompt = `You have live access to X/Twitter search. Use it now.

STEP 1: For each account in this list, use x_search to find their posts from the last ${hoursBack} hours: ${accountsList}

Search query format: "from:USERNAME since:DATETIME" — run this for each account. The search results will include the actual tweet URLs in the format https://x.com/username/status/TWEETID. Copy these URLs exactly as returned.

STEP 2: From the search results, identify the ${maxOpportunities} best reply opportunities:
- Prioritize posts with high engagement (likes > 50 OR replies > 10)
- Focus on posts about Bitcoin, sovereignty, monetary policy, self-custody, macro, or philosophy
- Skip: price predictions, TA, meme posts, personal announcements unrelated to Bitcoin

STEP 3: For each opportunity, copy from the x_search result verbatim:
- The full tweet URL exactly as it appeared in search results (https://x.com/username/status/NUMERIC_ID)
- Extract the numeric ID from the end of that URL
- The exact tweet text as returned by search
- The engagement numbers as returned by search

IMPORTANT: Only provide tweet_url and tweet_id if you retrieved them directly from x_search results this session. The URL must be in the format https://x.com/[handle]/status/[19-digit-number]. If x_search did not return a URL for a tweet, set both fields to null — do not construct or guess URLs.
- Content signals: What position does this tweet take? Identify these factual signals:
  * Does it promote or defend custodial solutions (exchanges, ETFs, lending platforms)?
  * Does it celebrate ETF inflows as "adoption" or institutional validation?
  * Does it advocate self-custody, sovereignty, or trustlessness?
  * Does it make a price-first or macro argument that ignores custody considerations?
  * Does it defend or critique proof of work?
  * Does it trust or question institutions?
  * What specific claim or framing is it making?

CRITICAL: tweet_id and tweet_url must come from actual search results. If you cannot retrieve the URL for a post, set both to null. DO NOT fabricate, guess, or construct IDs.

STEP 4: Identify 1-2 proactive thread opportunities based on what's trending in the Bitcoin/macro space right now.

Return ONLY this JSON (no other text, no markdown):
{
  "opportunities": [
    {
      "type": "reply",
      "tweet_id": "exact numeric ID from URL, or null",
      "tweet_url": "full https://x.com/... URL, or null",
      "author": "handle without @",
      "text_preview": "exact tweet text, first 200 chars",
      "engagement": { "likes": 0, "replies": 0 },
      "content_signals": "factual description of what position this tweet takes — e.g. 'celebrates ETF inflows as mainstream adoption' or 'advocates hardware wallet self-custody' or 'critiques exchange dependence after hack'",
      "suggested_angle": "what specific angle could add value or challenge this post",
      "urgency": "high or normal"
    }
  ],
  "proactive_topics": [
    {
      "topic": "specific topic",
      "rationale": "why this is relevant right now",
      "suggested_approach": "3-5 sentence thread outline"
    }
  ]
}`;

  const startTime = Date.now();
  
  const response = await xai.chat.completions.create({
    model: 'grok-4-1-fast-reasoning',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4000
  });

  const tokensUsed = response.usage?.total_tokens || 0;
  const costEstimate = (tokensUsed / 1_000_000) * (response.model.includes('reasoning') ? 15 : 2); // Approximate
  
  const content = response.choices[0]?.message?.content || '';
  
  // Extract JSON from response
  let jsonMatch = content.match(/\{[\s\S]*\}/);
  let results = { opportunities: [], proactive_topics: [] };
  
  if (jsonMatch) {
    try {
      results = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse JSON from Grok response:', e.message);
    }
  }

  // Filter to max opportunities
  results.opportunities = results.opportunities.slice(0, maxOpportunities);
  results.proactive_topics = results.proactive_topics.slice(0, 2);

  // Log the scan
  await logScan({
    scanType,
    accounts,
    hoursBack,
    opportunitiesFound: results.opportunities.length,
    proactiveTopicsFound: results.proactive_topics.length,
    tokensUsed,
    costEstimate,
    durationMs: Date.now() - startTime
  });

  return {
    opportunities: results.opportunities,
    proactiveTopics: results.proactive_topics,
    costEstimate,
    tokensUsed
  };
}

/**
 * Log scan to memory file
 */
async function logScan(scanData) {
  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Bangkok' });
  const logPath = path.join(__dirname, '..', '..', 'memory', `xai-scan-${today}.log`);
  
  // Ensure memory directory exists
  const memoryDir = path.dirname(logPath);
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...scanData
  };
  
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const accounts = process.argv[2]?.split(',') || ['saylor', 'naval'];
  const hoursBack = parseInt(process.argv[3]) || 12;
  
  console.log(`Scanning ${accounts.join(', ')} for last ${hoursBack} hours...`);
  
  runGrokScan({ accounts, hoursBack, scanType: 'manual' })
    .then(results => {
      console.log('\n=== OPPORTUNITIES ===');
      results.opportunities.forEach((opp, i) => {
        console.log(`\n${i + 1}. @${opp.author} (${opp.urgency})`);
        console.log(`   ${opp.text_preview?.slice(0, 150)}...`);
        console.log(`   Angle: ${opp.suggested_angle}`);
      });
      
      console.log('\n=== PROACTIVE TOPICS ===');
      results.proactiveTopics.forEach((topic, i) => {
        console.log(`\n${i + 1}. ${topic.topic}`);
        console.log(`   ${topic.rationale}`);
      });
      
      console.log(`\nTokens used: ${results.tokensUsed}, Est. cost: $${results.costEstimate.toFixed(4)}`);
    })
    .catch(err => {
      console.error('Scan failed:', err);
      process.exit(1);
    });
}

export default runGrokScan;
