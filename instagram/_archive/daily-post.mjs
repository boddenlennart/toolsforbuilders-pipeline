#!/usr/bin/env node
// daily-post.mjs — Daily orchestrator for Instagram content pipeline
// Run: node daily-post.mjs [--dry-run] [--force-generate]
// PM2 Cron: 0 2 * * * (2:00 AM UTC = 9:00 AM Bangkok)
//
// Flow:
// 1. Check content queue for pending posts
// 2. If queue is low, trigger content generation
// 3. Pick today's post (rotating through pillars)
// 4. Generate images if not done
// 5. Send to approval bot

import { spawn } from 'child_process';
import { readJSON, writeJSON, formatBangkokTimestamp, formatBangkokDate, PILLARS, PATHS } from './utils.mjs';

const MIN_QUEUE_SIZE = 7; // Keep 7 days of content ready
const PILLAR_COOLDOWN_DAYS = 1; // Don't repeat same pillar within this many days

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Running ${scriptName}...`);
    
    const proc = spawn('node', [scriptName, ...args], {
      cwd: PATHS.root,
      stdio: 'inherit'
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function selectNextPost(queue) {
  const pendingPosts = queue.posts.filter(p => 
    p.status === 'pending' && p.imagesGenerated
  );
  
  if (pendingPosts.length === 0) {
    return null;
  }
  
  // Get recently used pillars
  const recentPosts = queue.posts
    .filter(p => p.status === 'published' || p.status === 'approved')
    .slice(-PILLAR_COOLDOWN_DAYS);
  
  const recentPillars = new Set(recentPosts.map(p => p.pillar));
  
  // Try to find a post with a pillar we haven't used recently
  for (const post of pendingPosts) {
    if (!recentPillars.has(post.pillar)) {
      return post;
    }
  }
  
  // If all pillars are recent, just take the oldest pending post
  return pendingPosts[0];
}

function getQueueStats(queue) {
  const stats = {
    total: queue.posts.length,
    pending: 0,
    awaitingApproval: 0,
    approved: 0,
    published: 0,
    rejected: 0,
    needsImages: 0
  };
  
  for (const post of queue.posts) {
    switch (post.status) {
      case 'pending':
        stats.pending++;
        if (!post.imagesGenerated) stats.needsImages++;
        break;
      case 'awaiting_approval':
        stats.awaitingApproval++;
        break;
      case 'approved':
        stats.approved++;
        break;
      case 'published':
        stats.published++;
        break;
      case 'rejected':
        stats.rejected++;
        break;
    }
  }
  
  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forceGenerate = args.includes('--force-generate');
  const skipApproval = args.includes('--skip-approval');
  
  console.log('='.repeat(60));
  console.log('🚀 DAILY ORCHESTRATOR - @toolsforbuilders');
  console.log(`🕐 ${formatBangkokTimestamp()}`);
  console.log(`📅 ${formatBangkokDate()}`);
  if (dryRun) console.log('🔍 DRY RUN MODE');
  console.log('='.repeat(60));
  
  // Read or initialize queue
  let queue = readJSON('content-queue.json') || { posts: [], lastUpdated: null };
  let stats = getQueueStats(queue);
  
  console.log('\n📊 Queue Status:');
  console.log(`   Total posts: ${stats.total}`);
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Awaiting approval: ${stats.awaitingApproval}`);
  console.log(`   Approved (ready to post): ${stats.approved}`);
  console.log(`   Published: ${stats.published}`);
  console.log(`   Needs images: ${stats.needsImages}`);
  
  // Step 1: Check if we need more content
  const availablePosts = stats.pending + stats.approved + stats.awaitingApproval;
  const needsContent = availablePosts < MIN_QUEUE_SIZE || forceGenerate;
  
  if (needsContent) {
    console.log(`\n📝 Queue is low (${availablePosts}/${MIN_QUEUE_SIZE}). Generating content...`);
    
    // Check if we have fresh trends
    const trends = readJSON('weekly-trends.json');
    const trendAge = trends?.generatedAt 
      ? (Date.now() - new Date(trends.generatedAt).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;
    
    if (trendAge > 7) {
      console.log('   📊 Trends are stale. Running research first...');
      if (!dryRun) {
        await runScript('research-trends.mjs');
      }
    }
    
    // Generate content
    if (!dryRun) {
      await runScript('generate-content.mjs');
      
      // Reload queue after generation
      queue = readJSON('content-queue.json') || queue;
      stats = getQueueStats(queue);
    }
  }
  
  // Step 2: Generate images for posts that need them
  if (stats.needsImages > 0) {
    console.log(`\n🎨 Generating images for ${stats.needsImages} posts...`);
    if (!dryRun) {
      await runScript('generate-images.mjs');
      
      // Reload queue
      queue = readJSON('content-queue.json') || queue;
      stats = getQueueStats(queue);
    }
  }
  
  // Step 3: Select today's post
  console.log('\n🎯 Selecting post for today...');
  
  // Check if we already have an approved post ready
  const approvedPost = queue.posts.find(p => p.status === 'approved' && p.imagesGenerated);
  
  if (approvedPost) {
    console.log(`   ✓ Approved post ready: ${approvedPost.hook?.substring(0, 40)}...`);
    console.log(`   Pillar: ${approvedPost.pillar}`);
    
    if (!dryRun && !skipApproval) {
      console.log('\n📤 Posting to Instagram...');
      await runScript('post-to-instagram.mjs', [`--post-id=${approvedPost.id}`]);
    }
  } else {
    // Select next pending post for approval
    const nextPost = selectNextPost(queue);
    
    if (nextPost) {
      console.log(`   📋 Next post: ${nextPost.hook?.substring(0, 40)}...`);
      console.log(`   Pillar: ${nextPost.pillar}`);
      
      if (!dryRun) {
        console.log('\n📱 Sending for approval...');
        await runScript('approval-bot.mjs', [`--post-id=${nextPost.id}`]);
      }
    } else {
      console.log('   ⚠️ No posts ready for approval!');
      console.log('   Run: npm run generate && npm run images');
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Daily orchestration complete!');
  
  if (dryRun) {
    console.log('\n📝 DRY RUN — No changes made. Run without --dry-run to execute.');
  }
  
  // Summary
  queue = readJSON('content-queue.json') || queue;
  stats = getQueueStats(queue);
  
  console.log('\n📊 Final Queue Status:');
  console.log(`   Ready for approval: ${stats.pending}`);
  console.log(`   Awaiting approval: ${stats.awaitingApproval}`);
  console.log(`   Ready to post: ${stats.approved}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
