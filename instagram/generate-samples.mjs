#!/usr/bin/env node
// generate-samples.mjs — Generate fresh carousel samples for v2 design
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = `${__dirname}/data`;

// Load existing content queue
const queuePath = `${dataDir}/content-queue.json`;
const originalQueue = JSON.parse(readFileSync(queuePath, 'utf-8'));

// Define our three sample posts
const samplePosts = [
  {
    id: 'carousel-1-free-stack-v2',
    createdAt: new Date().toISOString(),
    status: 'pending',
    pillar: 'Tool Stacks & Comparisons',
    sourceTopic: 'The $0 AI Stack (Updated 03/2026)',
    hook: 'The $0 AI stack that gets me 10 posts/week in 2 hours',
    slides: [
      { num: 1, type: 'hook', headline: 'The $0 AI Stack', bullets: [] },
      { num: 2, type: 'content', headline: '1. Claude Free (Sonnet 4.6)', bullets: ['Opus-level writing quality', 'Limited messages, resets every 5h', 'Perfect for captions & scripts'] },
      { num: 3, type: 'content', headline: '2. Gemini Free (3.1 Pro)', bullets: ['15 requests/min, 1,500/day free', 'Nano Banana 2 image gen', 'Best free tier for research'] },
      { num: 4, type: 'content', headline: '3. NotebookLM', bullets: ['Turn PDFs into podcasts', 'Completely free', 'Audio overview feature'] },
      { num: 5, type: 'content', headline: '4. DeepSeek', bullets: ['Web app completely free', 'GPT-4 quality at 95% less cost', 'Best for coding tasks'] },
      { num: 6, type: 'cta', headline: 'Follow @toolsforbuilders for more free AI stacks', bullets: [] }
    ],
    imagesGenerated: false,
    reelGenerated: false
  },
  {
    id: 'carousel-2-comparison-v2',
    createdAt: new Date().toISOString(),
    status: 'pending',
    pillar: 'Tool Stacks & Comparisons',
    sourceTopic: 'n8n vs Make.com vs Zapier',
    hook: 'n8n vs Make.com vs Zapier — which automation tool should you choose?',
    slides: [
      { num: 1, type: 'hook', headline: 'n8n vs Make.com vs Zapier', bullets: [] },
      { num: 2, type: 'content', headline: 'n8n (Winner)', bullets: ['Free self-hosted', 'AI agent nodes native', 'No per-operation costs'] },
      { num: 3, type: 'content', headline: 'Make.com', bullets: ['1,000 ops/month free', 'Best Instagram integration', 'Visual builder'] },
      { num: 4, type: 'content', headline: 'Zapier', bullets: ['100 tasks/month free', 'Largest app ecosystem', 'Most expensive at scale'] },
      { num: 5, type: 'cta', headline: 'Follow @toolsforbuilders for automation tips', bullets: [] }
    ],
    imagesGenerated: false,
    reelGenerated: false
  },
  {
    id: 'carousel-3-autopilot-v2',
    createdAt: new Date().toISOString(),
    status: 'pending',
    pillar: 'Workflow Breakdowns',
    sourceTopic: 'How I run my Instagram on autopilot',
    hook: 'How I run my entire Instagram with AI agents while working a 9‑5',
    slides: [
      { num: 1, type: 'hook', headline: 'Instagram on Autopilot', bullets: [] },
      { num: 2, type: 'content', headline: '1. Content Generation', bullets: ['Claude writes captions', 'Canva AI designs carousels', 'Batch create 10 posts/week'] },
      { num: 3, type: 'content', headline: '2. Scheduling', bullets: ['Later for visual calendar', 'Auto-post to Instagram', 'Link in bio management'] },
      { num: 4, type: 'content', headline: '3. Engagement', bullets: ['ManyChat comment-to-DM', 'OpenClaw monitors mentions', 'Auto-respond to common questions'] },
      { num: 5, type: 'cta', headline: 'Follow @toolsforbuilders for daily AI tools', bullets: [] }
    ],
    imagesGenerated: false,
    reelGenerated: false
  }
];

// Create new queue with only these posts
const newQueue = {
  posts: samplePosts,
  lastUpdated: new Date().toISOString()
};

// Backup original queue
const backupPath = `${dataDir}/content-queue.json.backup`;
copyFileSync(queuePath, backupPath);
console.log(`✓ Backed up original queue to ${backupPath}`);

// Write new queue
writeFileSync(queuePath, JSON.stringify(newQueue, null, 2));
console.log('✓ Wrote temporary queue with sample posts');

// Now run generate-images.mjs
console.log('\n🎨 Running generate-images.mjs...');
import('./generate-images.mjs').catch(err => {
  console.error('Failed to run generate-images.mjs:', err);
  process.exit(1);
});

// Note: generate-images.mjs will update the queue with imagePaths, imagesGenerated true.
// After completion, we need to move generated images to samples directory and restore original queue.
// We'll do that in a separate step after images are generated.
// For now, we'll just let it run and assume we'll handle manually.
console.log('\n⚠️  After generation completes, run restore-queue.mjs to restore original queue.');