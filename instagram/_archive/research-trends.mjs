#!/usr/bin/env node
// research-trends.mjs — Multi-source trend research for @toolsforbuilders
// Run: node research-trends.mjs
// Cron: Sundays at 2:00 AM UTC (9:00 AM Bangkok)
//
// Sources:
// 1. RSS Feeds — TechCrunch, VentureBeat, TNW, Product Hunt, HN, Ben's Bites
// 2. Brave Search — validate tools, check traction
// 3. Claude Synthesis — extract actionable content angles

import Parser from 'rss-parser';
import { writeJSON, readJSON, loadEnv, formatBangkokTimestamp, sleep, PILLARS } from './utils.mjs';

const env = loadEnv();
const BRAVE_API_KEY = 'BSA0JzeWhR1C2ZEOGt-BqBfmK8f48xM';
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

// RSS Feed sources
const RSS_FEEDS = [
  { name: 'Product Hunt', url: 'https://www.producthunt.com/feed', priority: 'high', type: 'tools' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', priority: 'high', type: 'community' },
  { name: 'Ben\'s Bites', url: 'https://bensbites.beehiiv.com/feed', priority: 'high', type: 'ai-news' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', priority: 'medium', type: 'news' },
  { name: 'VentureBeat AI', url: 'https://feeds.feedburner.com/venturebeat/SZYF', priority: 'medium', type: 'ai-news' },
  { name: 'The Next Web', url: 'https://thenextweb.com/feed/', priority: 'low', type: 'news' }
];

// Keywords for filtering relevant content
const RELEVANCE_KEYWORDS = [
  'ai', 'automation', 'tool', 'startup', 'solopreneur', 'indie', 'maker',
  'productivity', 'workflow', 'no-code', 'low-code', 'saas', 'api',
  'chatgpt', 'claude', 'gpt', 'llm', 'agent', 'copilot', 'assistant',
  'notion', 'zapier', 'make', 'airtable', 'cursor', 'v0', 'bolt',
  'launch', 'funding', 'bootstrap', 'build', 'ship', 'growth'
];

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'ToolsForBuilders-Research/1.0' }
});

// ============ RSS FEED PARSING ============

async function fetchRSSFeed(feed) {
  try {
    console.log(`   📡 Fetching ${feed.name}...`);
    const result = await parser.parseURL(feed.url);
    
    const items = result.items.slice(0, 20).map(item => ({
      source: feed.name,
      sourceType: feed.type,
      priority: feed.priority,
      title: item.title || '',
      url: item.link || '',
      description: item.contentSnippet || item.content || '',
      date: item.pubDate || item.isoDate || new Date().toISOString(),
      guid: item.guid || item.link
    }));
    
    console.log(`      ✓ Got ${items.length} items`);
    return items;
  } catch (error) {
    console.error(`      ❌ Error: ${error.message}`);
    return [];
  }
}

function scoreRelevance(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = 0;
  
  // Base score by source priority
  if (item.priority === 'high') score += 30;
  else if (item.priority === 'medium') score += 20;
  else score += 10;
  
  // Keyword matching
  for (const keyword of RELEVANCE_KEYWORDS) {
    if (text.includes(keyword)) {
      score += 5;
    }
  }
  
  // Bonus for tool-specific content
  if (item.sourceType === 'tools') score += 15;
  
  // Recency bonus (items from last 3 days)
  const itemDate = new Date(item.date);
  const daysSince = (Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 1) score += 20;
  else if (daysSince < 3) score += 10;
  else if (daysSince < 7) score += 5;
  
  return score;
}

function filterAndScoreItems(items) {
  return items
    .map(item => ({
      ...item,
      relevanceScore: scoreRelevance(item)
    }))
    .filter(item => item.relevanceScore >= 25) // Minimum threshold
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ============ BRAVE SEARCH VALIDATION ============

async function braveSearch(query) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=pw`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.web?.results || [];
  } catch (error) {
    console.error(`   ❌ Brave search error: ${error.message}`);
    return [];
  }
}

function extractToolName(title) {
  // Try to extract tool/product name from title
  // Patterns: "X launches...", "X raises...", "Introducing X", "X: description"
  const patterns = [
    /^([A-Z][a-zA-Z0-9]+)\s+(?:launches|raises|announces|introduces)/i,
    /^Introducing\s+([A-Z][a-zA-Z0-9]+)/i,
    /^([A-Z][a-zA-Z0-9]+):/,
    /^([A-Z][a-zA-Z0-9]+)\s*[-–—]\s*/
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

async function validateTools(items) {
  const validated = [];
  const toolsToValidate = items.filter(item => {
    const toolName = extractToolName(item.title);
    return toolName && toolName.length > 2;
  }).slice(0, 10); // Limit to avoid rate limiting
  
  console.log(`\n🔍 Validating ${toolsToValidate.length} potential tools via Brave Search...`);
  
  for (const item of toolsToValidate) {
    const toolName = extractToolName(item.title);
    if (!toolName) continue;
    
    console.log(`   🔎 Checking: ${toolName}`);
    
    // Search for reviews and alternatives (signals real traction)
    const reviewResults = await braveSearch(`${toolName} review`);
    const altResults = await braveSearch(`${toolName} alternatives`);
    
    const totalMentions = reviewResults.length + altResults.length;
    
    if (totalMentions >= 3) {
      console.log(`      ✓ Validated (${totalMentions} mentions)`);
      validated.push({
        ...item,
        toolName,
        validationScore: totalMentions,
        validated: true,
        reviewSnippets: reviewResults.slice(0, 2).map(r => r.description)
      });
    } else {
      console.log(`      ○ Low traction (${totalMentions} mentions)`);
    }
    
    await sleep(300); // Rate limiting
  }
  
  return validated;
}

// ============ CLAUDE SYNTHESIS ============

async function synthesizeWithClaude(rssItems, validatedTools) {
  if (!ANTHROPIC_API_KEY) {
    console.log('\n⚠️ ANTHROPIC_API_KEY not set — skipping Claude synthesis');
    console.log('   Add to .env.secrets for AI-powered content angle generation');
    return generateFallbackAngles(rssItems, validatedTools);
  }
  
  console.log('\n🧠 Synthesizing with Claude...');
  
  const prompt = `You're researching content for @toolsforbuilders, an Instagram account about AI tools and automation for solopreneurs.

Analyze these signals from the past week:

## RSS Feed Items (Top 20 by relevance)
${rssItems.slice(0, 20).map(i => `- [${i.source}] ${i.title}\n  ${i.description?.substring(0, 150)}...`).join('\n')}

## Validated Tools (confirmed traction)
${validatedTools.map(t => `- ${t.toolName}: ${t.title}\n  Reviews mention: ${t.reviewSnippets?.join(' | ') || 'N/A'}`).join('\n')}

Extract and return JSON with:
1. "newTools": Array of genuinely new tools worth covering (name, what it does, why it matters, content angle)
2. "trendingTopics": Array of trending themes in the solopreneur/AI space right now
3. "contentAngles": Array of specific carousel post ideas with:
   - "hook": scroll-stopping first line
   - "pillar": one of ${PILLARS.join(', ')}
   - "slides": 5-7 slide headlines
   - "whyNow": why this is timely

Focus on angles that haven't been overdone. No generic "10 AI tools" posts — find the specific, interesting angles.

Return valid JSON only, no markdown.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Claude API: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.content[0].text;
    
    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON in response');
    
  } catch (error) {
    console.error(`   ❌ Claude synthesis error: ${error.message}`);
    return generateFallbackAngles(rssItems, validatedTools);
  }
}

function generateFallbackAngles(rssItems, validatedTools) {
  // Fallback when Claude isn't available
  return {
    newTools: validatedTools.slice(0, 5).map(t => ({
      name: t.toolName,
      description: t.description,
      source: t.url
    })),
    trendingTopics: [
      'AI agents for workflows',
      'No-code automation',
      'Solopreneur productivity stacks'
    ],
    contentAngles: rssItems.slice(0, 7).map((item, i) => ({
      hook: item.title,
      pillar: PILLARS[i % PILLARS.length],
      slides: ['Hook', 'Problem', 'Solution', 'How-to', 'Results', 'CTA'],
      whyNow: 'Trending this week',
      source: item.url
    }))
  };
}

// ============ MAIN ============

async function main() {
  console.log('='.repeat(60));
  console.log('📊 MULTI-SOURCE TREND RESEARCH - @toolsforbuilders');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log('='.repeat(60));
  
  // Step 1: Fetch all RSS feeds
  console.log('\n📡 STEP 1: Fetching RSS feeds...');
  const allItems = [];
  
  for (const feed of RSS_FEEDS) {
    const items = await fetchRSSFeed(feed);
    allItems.push(...items);
    await sleep(500); // Be nice to servers
  }
  
  console.log(`\n   Total items collected: ${allItems.length}`);
  
  // Step 2: Filter and score by relevance
  console.log('\n📈 STEP 2: Scoring relevance...');
  const scoredItems = filterAndScoreItems(allItems);
  console.log(`   Relevant items (score ≥25): ${scoredItems.length}`);
  
  // Deduplicate by URL
  const uniqueItems = scoredItems.filter((item, index, self) =>
    index === self.findIndex(t => t.url === item.url)
  );
  console.log(`   After deduplication: ${uniqueItems.length}`);
  
  // Step 3: Validate tools via Brave Search
  const validatedTools = await validateTools(uniqueItems);
  console.log(`\n   Validated tools with traction: ${validatedTools.length}`);
  
  // Step 4: Claude synthesis
  const synthesis = await synthesizeWithClaude(uniqueItems, validatedTools);
  
  // Step 5: Build output
  const output = {
    generatedAt: formatBangkokTimestamp(),
    weekOf: new Date().toISOString().split('T')[0],
    stats: {
      totalFeedsChecked: RSS_FEEDS.length,
      totalItemsFound: allItems.length,
      relevantItems: uniqueItems.length,
      validatedTools: validatedTools.length
    },
    sources: RSS_FEEDS.map(f => f.name),
    
    // Synthesized content
    newTools: synthesis.newTools || [],
    trendingTopics: synthesis.trendingTopics || [],
    contentAngles: (synthesis.contentAngles || []).map((angle, i) => ({
      id: `angle-${Date.now()}-${i}`,
      ...angle,
      status: 'new'
    })),
    
    // Raw data for reference
    validatedTools: validatedTools,
    topItems: uniqueItems.slice(0, 30).map(item => ({
      source: item.source,
      title: item.title,
      url: item.url,
      date: item.date,
      relevanceScore: item.relevanceScore
    }))
  };
  
  writeJSON('weekly-trends.json', output);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Research complete!');
  console.log(`   📦 New tools identified: ${output.newTools.length}`);
  console.log(`   📈 Trending topics: ${output.trendingTopics.length}`);
  console.log(`   🎨 Content angles ready: ${output.contentAngles.length}`);
  console.log('   📁 Output: data/weekly-trends.json');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
