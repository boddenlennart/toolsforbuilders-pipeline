#!/usr/bin/env node
// generate-content.mjs — Generate carousel posts and captions using Claude
// Run: node generate-content.mjs
// Requires: ANTHROPIC_API_KEY in .env.secrets

import { readJSON, writeJSON, loadEnv, formatBangkokTimestamp, PILLARS } from './utils.mjs';

const env = loadEnv();
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env.secrets');
  console.error('   Add: ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a content creator for @toolsforbuilders, an Instagram account about AI tools and automation for solopreneurs and indie builders.

BRAND VOICE:
- Direct, no fluff, actionable
- Sounds like a real person sharing discoveries, not a corporate account
- Uses "I", "you", personal stories
- Avoids: "game-changer", "unleash", "in today's fast-paced world", generic AI hype
- Tone: Helpful friend who's obsessed with productivity tools

CONTENT STYLE:
- Carousel posts: 5-7 slides, punchy headlines, 2-3 bullet points max per slide
- Hooks must stop the scroll — use curiosity, controversy, or specific results
- Each slide should be valuable standalone
- Last slide always has CTA + @toolsforbuilders

HASHTAG STRATEGY (max 30):
- Mix of: niche (#aitools #solopreneur #indiemaker) + broad (#productivity #automation)
- Include: #toolsforbuilders #buildinpublic

OUTPUT FORMAT: Respond with valid JSON only, no markdown code blocks.`;

async function generateWithClaude(prompt) {
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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  const text = data.content[0].text;
  
  // Parse JSON from response
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Could not parse JSON from Claude response');
  }
}

function buildPrompt(topic, pillar) {
  return `Create an Instagram carousel post for @toolsforbuilders.

TOPIC: ${topic.title}
PILLAR: ${pillar}
SOURCE INFO: ${topic.description}

Generate a complete carousel post with:

1. HOOK: A scroll-stopping first line (curiosity, controversy, or specific result)
2. SLIDES: 5-7 slides, each with:
   - headline (bold, max 8 words)
   - bullets (2-3 short bullet points, max 10 words each)
   - type (hook/problem/solution/how/result/cta)
3. CAPTION: 
   - Hook line (same as slide 1)
   - 2-3 sentences of value/context
   - CTA (save this, follow for more, etc.)
   - Hashtags (max 30, on new lines)

Return as JSON:
{
  "hook": "The scroll-stopping first line",
  "slides": [
    {"num": 1, "type": "hook", "headline": "...", "bullets": ["...", "..."]},
    ...
  ],
  "caption": "Full caption text with hashtags"
}`;
}

async function main() {
  console.log('='.repeat(50));
  console.log('🎨 CONTENT GENERATION - @toolsforbuilders');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log('='.repeat(50));
  
  // Read trend research
  const trends = readJSON('weekly-trends.json');
  if (!trends) {
    console.error('❌ No weekly-trends.json found. Run research-trends.mjs first.');
    process.exit(1);
  }
  
  // Read existing queue
  let queue = readJSON('content-queue.json') || { posts: [], lastUpdated: null };
  
  // Get pending posts count
  const pendingCount = queue.posts.filter(p => p.status === 'pending').length;
  console.log(`📦 Current queue: ${pendingCount} pending posts`);
  
  // Generate 7 days worth of content if queue is low
  const targetPosts = 7;
  const postsToGenerate = Math.max(0, targetPosts - pendingCount);
  
  if (postsToGenerate === 0) {
    console.log('✓ Queue is full, no generation needed');
    return;
  }
  
  console.log(`\n📝 Generating ${postsToGenerate} new posts...`);
  
  // Select topics from content ideas, rotating through pillars
  const ideas = trends.contentIdeas || [];
  if (ideas.length === 0) {
    console.error('❌ No content ideas found in trends. Re-run research.');
    process.exit(1);
  }
  
  // Track last pillar used
  const lastPillar = queue.posts.length > 0 
    ? queue.posts[queue.posts.length - 1].pillar 
    : null;
  
  let currentPillarIndex = lastPillar ? PILLARS.indexOf(lastPillar) : -1;
  
  for (let i = 0; i < postsToGenerate && i < ideas.length; i++) {
    // Rotate to next pillar
    currentPillarIndex = (currentPillarIndex + 1) % PILLARS.length;
    const targetPillar = PILLARS[currentPillarIndex];
    
    // Find an idea matching this pillar
    const idea = ideas.find(id => id.pillar === targetPillar) || ideas[i];
    
    console.log(`\n[${i + 1}/${postsToGenerate}] Generating: ${idea.title.substring(0, 50)}...`);
    console.log(`   Pillar: ${idea.pillar}`);
    
    try {
      const content = await generateWithClaude(buildPrompt(idea, idea.pillar));
      
      const post = {
        id: `post-${Date.now()}-${i}`,
        createdAt: formatBangkokTimestamp(),
        status: 'pending',
        pillar: idea.pillar,
        sourceTopic: idea.title,
        sourceUrl: idea.source,
        hook: content.hook,
        slides: content.slides,
        caption: content.caption,
        imagesGenerated: false,
        imagePaths: []
      };
      
      queue.posts.push(post);
      console.log(`   ✓ Generated ${content.slides.length} slides`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
    
    // Small delay between API calls
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Save updated queue
  queue.lastUpdated = formatBangkokTimestamp();
  writeJSON('content-queue.json', queue);
  
  const newPending = queue.posts.filter(p => p.status === 'pending').length;
  console.log(`\n✅ Generation complete!`);
  console.log(`   Queue now has ${newPending} pending posts`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
