#!/usr/bin/env node
// generate-sample-content.mjs — Create sample carousels and reels for @toolsforbuilders
import { readJSON, writeJSON, formatBangkokTimestamp, BRAND, PATHS } from './utils.mjs';

const knowledge = readJSON('knowledge-base.json');

function createCarousel1() {
  return {
    id: 'carousel-1-free-stack',
    createdAt: formatBangkokTimestamp(),
    status: 'pending',
    pillar: 'Tool Stacks & Comparisons',
    sourceTopic: 'The $0 AI Stack',
    hook: 'The $0 AI stack that gets me 10 posts/week in 2 hours',
    slides: [
      {
        num: 1,
        type: 'hook',
        headline: 'The $0 AI Stack',
        bullets: []
      },
      {
        num: 2,
        type: 'content',
        headline: '1. Claude Free (Sonnet 4.6)',
        bullets: ['Opus-level writing quality', 'Limited messages, resets every 5h', 'Perfect for captions & scripts']
      },
      {
        num: 3,
        type: 'content',
        headline: '2. Gemini Free (3.1 Pro)',
        bullets: ['15 requests/min, 1,500/day free', 'Nano Banana 2 image gen', 'Best free tier for research']
      },
      {
        num: 4,
        type: 'content',
        headline: '3. NotebookLM',
        bullets: ['Turn PDFs into podcasts', 'Completely free', 'Audio overview feature']
      },
      {
        num: 5,
        type: 'content',
        headline: '4. DeepSeek',
        bullets: ['Web app completely free', 'GPT-4 quality at 95% less cost', 'Best for coding tasks']
      },
      {
        num: 6,
        type: 'cta',
        headline: 'Follow @toolsforbuilders for more free AI stacks',
        bullets: []
      }
    ],
    caption: `The $0 AI stack that gets me 10 posts/week in 2 hours

I use these four completely free tools to create all my content:
1. Claude Free (Sonnet 4.6) – writing
2. Gemini Free – research + images
3. NotebookLM – PDF analysis
4. DeepSeek – coding + backup

Zero cost. Zero credit card.

Which free tool are you using? 👇

#AI #solopreneur #freetools #automation #toolsforbuilders`,
    imagesGenerated: false,
    reelGenerated: false
  };
}

function createCarousel2() {
  return {
    id: 'carousel-2-comparison',
    createdAt: formatBangkokTimestamp(),
    status: 'pending',
    pillar: 'Tool Stacks & Comparisons',
    sourceTopic: 'n8n vs Make.com vs Zapier',
    hook: 'n8n vs Make.com vs Zapier — which automation tool should you choose?',
    slides: [
      {
        num: 1,
        type: 'hook',
        headline: 'n8n vs Make.com vs Zapier',
        bullets: []
      },
      {
        num: 2,
        type: 'content',
        headline: 'n8n (Winner)',
        bullets: ['Free self-hosted', 'AI agent nodes native', 'No per-operation costs']
      },
      {
        num: 3,
        type: 'content',
        headline: 'Make.com',
        bullets: ['1,000 ops/month free', 'Best Instagram integration', 'Visual builder']
      },
      {
        num: 4,
        type: 'content',
        headline: 'Zapier',
        bullets: ['100 tasks/month free', 'Largest app ecosystem', 'Most expensive at scale']
      },
      {
        num: 5,
        type: 'cta',
        headline: 'Follow @toolsforbuilders for automation tips',
        bullets: []
      }
    ],
    caption: `n8n vs Make.com vs Zapier — which automation tool should you choose?

I've used all three. Here's my breakdown:

🏆 n8n – Best for technical solopreneurs (free self‑hosted)
🔧 Make.com – Best for no‑code Instagram automation
🔄 Zapier – Best if you need the widest app support (but expensive)

Which one are you using? Let me know in the comments 👇

#automation #n8n #makecom #zapier #solopreneur #toolsforbuilders`,
    imagesGenerated: false,
    reelGenerated: false
  };
}

function createCarousel3() {
  return {
    id: 'carousel-3-autopilot',
    createdAt: formatBangkokTimestamp(),
    status: 'pending',
    pillar: 'Workflow Breakdowns',
    sourceTopic: 'How I run my Instagram on autopilot',
    hook: 'How I run my entire Instagram with AI agents while working a 9‑5',
    slides: [
      {
        num: 1,
        type: 'hook',
        headline: 'Instagram on Autopilot',
        bullets: []
      },
      {
        num: 2,
        type: 'content',
        headline: '1. Content Generation',
        bullets: ['Claude writes captions', 'Canva AI designs carousels', 'Batch create 10 posts/week']
      },
      {
        num: 3,
        type: 'content',
        headline: '2. Scheduling',
        bullets: ['Later for visual calendar', 'Auto-post to Instagram', 'Link in bio management']
      },
      {
        num: 4,
        type: 'content',
        headline: '3. Engagement',
        bullets: ['ManyChat comment-to-DM', 'OpenClaw monitors mentions', 'Auto-respond to common questions']
      },
      {
        num: 5,
        type: 'cta',
        headline: 'Follow @toolsforbuilders for daily AI tools',
        bullets: []
      }
    ],
    caption: `How I run my entire Instagram with AI agents while working a 9‑5

Here's my exact setup:
1. Content Generation – Claude + Canva AI
2. Scheduling – Later (visual calendar)
3. Engagement – ManyChat + OpenClaw

Total time: 2 hours/week.

Want the step‑by‑step guide? Comment "GUIDE" and I'll DM you the full tutorial.

#InstagramAutomation #AIagents #solopreneur #contentcreation #toolsforbuilders`,
    imagesGenerated: false,
    reelGenerated: false
  };
}

function createReel1() {
  return {
    id: 'reel-1-free-tools',
    createdAt: formatBangkokTimestamp(),
    status: 'pending',
    pillar: 'Tool Reviews & Tutorials',
    sourceTopic: '3 free tools that replaced my $200/mo stack',
    hook: '3 free tools that replaced my $200/mo stack',
    slides: [
      {
        num: 1,
        type: 'hook',
        headline: '$200/mo stack → $0',
        bullets: []
      },
      {
        num: 2,
        type: 'content',
        headline: '1. Claude Free',
        bullets: ['Replaced Copy.ai ($49/mo)', 'Better writing quality']
      },
      {
        num: 3,
        type: 'content',
        headline: '2. Gemini Free',
        bullets: ['Replaced Midjourney ($10/mo)', 'Images + research in one']
      },
      {
        num: 4,
        type: 'content',
        headline: '3. n8n Self‑hosted',
        bullets: ['Replaced Zapier ($29/mo)', 'Unlimited automation']
      },
      {
        num: 5,
        type: 'cta',
        headline: 'Follow for more free tool swaps',
        bullets: []
      }
    ],
    caption: `3 free tools that replaced my $200/mo stack

1. Claude Free → Copy.ai
2. Gemini Free → Midjourney
3. n8n Self‑hosted → Zapier

Total savings: $200/month.

Which paid tool are you still using that has a free alternative? Let me know 👇

#freetools #AI #automation #solopreneur #toolsforbuilders`,
    imagesGenerated: false,
    reelGenerated: false
  };
}

function createReel2() {
  return {
    id: 'reel-2-agents',
    createdAt: formatBangkokTimestamp(),
    status: 'pending',
    pillar: 'Solopreneur Mindset',
    sourceTopic: 'AI agents vs automation — what\'s actually different',
    hook: 'AI agents vs automation — what\'s actually different',
    slides: [
      {
        num: 1,
        type: 'hook',
        headline: 'Agents vs Automation',
        bullets: []
      },
      {
        num: 2,
        type: 'content',
        headline: 'Automation',
        bullets: ['Follows rules', 'If X then Y', 'n8n, Make, Zapier']
      },
      {
        num: 3,
        type: 'content',
        headline: 'AI Agents',
        bullets: ['Think & adapt', 'Handle unexpected situations', 'OpenClaw, Lindy AI']
      },
      {
        num: 4,
        type: 'content',
        headline: 'Why it matters',
        bullets: ['Agents replace VAs', 'Automation replaces manual tasks', '2026 = Year of Agents']
      },
      {
        num: 5,
        type: 'cta',
        headline: 'Follow @toolsforbuilders for agent tutorials',
        bullets: []
      }
    ],
    caption: `AI agents vs automation — what's actually different

Automation = follows rules (if X then Y)
AI agents = think & adapt (handle unexpected)

2026 is the Year of Agentic AI.

Which one are you using? Agents or automation? 👇

#AIagents #automation #solopreneur #tech #toolsforbuilders`,
    imagesGenerated: false,
    reelGenerated: false
  };
}

function createReel3() {
  return {
    id: 'reel-3-underrated',
    createdAt: formatBangkokTimestamp(),
    status: 'pending',
    pillar: 'Tool Reviews & Tutorials',
    sourceTopic: 'The most underrated AI tool for solopreneurs',
    hook: 'The most underrated AI tool for solopreneurs',
    slides: [
      {
        num: 1,
        type: 'hook',
        headline: 'Most Underrated AI Tool',
        bullets: []
      },
      {
        num: 2,
        type: 'content',
        headline: 'NotebookLM',
        bullets: ['Completely free', 'Turn PDFs into podcasts', 'Google’s secret weapon']
      },
      {
        num: 3,
        type: 'content',
        headline: 'Why nobody talks about it',
        bullets: ['No marketing budget', 'Labs product', 'No mobile app yet']
      },
      {
        num: 4,
        type: 'content',
        headline: 'How I use it',
        bullets: ['Research PDFs in minutes', 'Create audio summaries', 'Study complex topics']
      },
      {
        num: 5,
        type: 'cta',
        headline: 'Follow for underrated tool gems',
        bullets: []
      }
    ],
    caption: `The most underrated AI tool for solopreneurs

NotebookLM is free, powerful, and nobody talks about it.

I use it to:
• Research PDFs in minutes
• Create podcast‑style summaries
• Study complex topics

Have you tried NotebookLM? Share your experience 👇

#NotebookLM #AI #research #solopreneur #toolsforbuilders`,
    imagesGenerated: false,
    reelGenerated: false
  };
}

async function main() {
  console.log('='.repeat(50));
  console.log('🎨 SAMPLE CONTENT GENERATION - @toolsforbuilders');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log('='.repeat(50));
  
  // Create sample posts
  const samplePosts = [
    createCarousel1(),
    createCarousel2(),
    createCarousel3(),
    createReel1(),
    createReel2(),
    createReel3()
  ];
  
  // Write to content-queue.json
  const queue = { posts: samplePosts, lastUpdated: formatBangkokTimestamp() };
  writeJSON('content-queue.json', queue);
  
  console.log('\n✅ Created 6 sample posts in content-queue.json');
  console.log('   Carousels: 1,2,3');
  console.log('   Reels: 4,5,6');
  console.log('\n📁 Next steps:');
  console.log('   1. Run node generate-images.mjs');
  console.log('   2. Run node generate-reel.mjs');
  console.log('   3. Check data/samples/ for output');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});