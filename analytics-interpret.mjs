#!/usr/bin/env node
/**
 * analytics-interpret.mjs — Turn raw metrics into actionable insights.
 * 
 * Handles sparse data honestly — won't overstate patterns with few posts.
 * 
 * Reads:
 *   - instagram/data/performance-log.jsonl (posts with metrics)
 * 
 * Writes:
 *   - instagram/data/performance-context.md (injected into weekly generation prompt)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  perfLog: join(__dirname, 'instagram/data/performance-log.jsonl'),
  perfContext: join(__dirname, 'instagram/data/performance-context.md'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Levels
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE = {
  INSUFFICIENT: { minPosts: 0, maxPosts: 2, label: 'insufficient', message: 'Too early for patterns — collecting baseline' },
  LOW:          { minPosts: 3, maxPosts: 6, label: 'low', message: 'Early signals — treat as directional, not definitive' },
  MEDIUM:       { minPosts: 7, maxPosts: 14, label: 'medium', message: 'Some patterns emerging' },
  HIGH:         { minPosts: 15, maxPosts: Infinity, label: 'high', message: 'Statistically meaningful' },
};

/**
 * Get confidence level based on number of posts with metrics
 * @param {number} postCount - Number of posts with metrics
 * @returns {Object} Confidence level object
 */
export function getConfidence(postCount) {
  if (postCount <= CONFIDENCE.INSUFFICIENT.maxPosts) return CONFIDENCE.INSUFFICIENT;
  if (postCount <= CONFIDENCE.LOW.maxPosts) return CONFIDENCE.LOW;
  if (postCount <= CONFIDENCE.MEDIUM.maxPosts) return CONFIDENCE.MEDIUM;
  return CONFIDENCE.HIGH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a hook headline contains numbers
 * @param {string} headline - Hook headline text
 * @returns {boolean}
 */
export function hasNumber(headline) {
  if (!headline) return false;
  // Match digits, dollar amounts, percentages, etc.
  return /\d/.test(headline);
}

/**
 * Derive calculated metrics from raw post data
 * @param {Object} post - Performance log entry with metrics
 * @returns {Object} Derived metrics
 */
export function deriveMetrics(post) {
  const ig = post.instagram;
  const yt = post.youtube;
  const days = post.daysAfterPost || 1; // Avoid division by zero
  
  return {
    // Instagram derived metrics
    saveRate: ig?.reach ? (ig.saved / ig.reach) : null,
    profileVisitRate: ig?.reach ? (ig.profileVisits / ig.reach) : null,
    shareRate: ig?.reach ? (ig.shares / ig.reach) : null,
    engagementRate: ig?.reach ? ((ig.likes + ig.comments + ig.saved + ig.shares) / ig.reach) : null,
    igReach: ig?.reach || null,
    
    // YouTube derived metrics
    ytViewsPerDay: yt?.views ? (yt.views / days) : null,
    ytSubsPerKViews: yt?.views ? (yt.subscribersGained / yt.views * 1000) : null,
    ytAvgViewDuration: yt?.avgViewDuration || null,
    ytViews: yt?.views || null,
    
    // Hook analysis
    hookHasNumber: hasNumber(post.hookHeadline),
    
    // Metadata
    pillar: post.pillar,
    scriptId: post.scriptId,
    topic: post.topic,
    hookHeadline: post.hookHeadline,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance Log Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all posts from performance log
 * @returns {Object[]} All performance log entries
 */
export function loadPerformanceLogs() {
  if (!existsSync(PATHS.perfLog)) return [];
  const lines = readFileSync(PATHS.perfLog, 'utf8').split('\n').filter(l => l.trim());
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Filter posts that have metrics collected
 * @param {Object[]} posts - All posts
 * @returns {Object[]} Posts with metrics
 */
export function getPostsWithMetrics(posts) {
  return posts.filter(p => p.metricsCollectedAt && (p.instagram || p.youtube));
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate pillar rankings by save rate
 * @param {Object[]} posts - Posts with metrics
 * @param {Object[]} metrics - Derived metrics for each post
 * @returns {Object[]} Pillar rankings
 */
function rankPillarsBySaveRate(posts, metrics) {
  const pillarStats = {};
  
  for (let i = 0; i < posts.length; i++) {
    const metric = metrics[i];
    if (metric.saveRate === null) continue;
    
    const pillar = metric.pillar || 'Unknown';
    if (!pillarStats[pillar]) {
      pillarStats[pillar] = { rates: [], sum: 0, count: 0 };
    }
    pillarStats[pillar].rates.push(metric.saveRate);
    pillarStats[pillar].sum += metric.saveRate;
    pillarStats[pillar].count++;
  }
  
  const rankings = Object.entries(pillarStats).map(([pillar, stats]) => ({
    pillar,
    avgSaveRate: stats.sum / stats.count,
    count: stats.count,
  }));
  
  return rankings.sort((a, b) => b.avgSaveRate - a.avgSaveRate);
}

/**
 * Analyze hook performance (number hooks vs. qualitative)
 * @param {Object[]} metrics - Derived metrics
 * @returns {Object} Hook analysis
 */
function analyzeHooks(metrics) {
  const withNumbers = metrics.filter(m => m.hookHasNumber && m.saveRate !== null);
  const withoutNumbers = metrics.filter(m => !m.hookHasNumber && m.saveRate !== null);
  
  const avgWithNumbers = withNumbers.length > 0
    ? withNumbers.reduce((sum, m) => sum + m.saveRate, 0) / withNumbers.length
    : null;
  const avgWithoutNumbers = withoutNumbers.length > 0
    ? withoutNumbers.reduce((sum, m) => sum + m.saveRate, 0) / withoutNumbers.length
    : null;
  
  return {
    withNumbers: { count: withNumbers.length, avgSaveRate: avgWithNumbers },
    withoutNumbers: { count: withoutNumbers.length, avgSaveRate: avgWithoutNumbers },
  };
}

/**
 * Compare platform performance
 * @param {Object[]} posts - Posts with metrics
 * @returns {Object} Platform comparison
 */
function comparePlatforms(posts) {
  const igPosts = posts.filter(p => p.instagram?.reach);
  const ytPosts = posts.filter(p => p.youtube?.views);
  
  const avgIgReach = igPosts.length > 0
    ? igPosts.reduce((sum, p) => sum + p.instagram.reach, 0) / igPosts.length
    : null;
  const avgYtViews = ytPosts.length > 0
    ? ytPosts.reduce((sum, p) => sum + p.youtube.views, 0) / ytPosts.length
    : null;
  
  return {
    instagram: { count: igPosts.length, avgReach: avgIgReach },
    youtube: { count: ytPosts.length, avgViews: avgYtViews },
  };
}

/**
 * Find the best performing post
 * @param {Object[]} posts - Posts with metrics
 * @param {Object[]} metrics - Derived metrics
 * @returns {Object|null} Best post info
 */
function findBestPost(posts, metrics) {
  let best = null;
  let bestSaveRate = -1;
  
  for (let i = 0; i < posts.length; i++) {
    const metric = metrics[i];
    if (metric.saveRate !== null && metric.saveRate > bestSaveRate) {
      bestSaveRate = metric.saveRate;
      best = {
        scriptId: posts[i].scriptId,
        topic: posts[i].topic,
        pillar: posts[i].pillar,
        saveRate: metric.saveRate,
        reach: metric.igReach,
      };
    }
  }
  
  return best;
}

/**
 * Calculate average benchmarks
 * @param {Object[]} posts - Posts with metrics
 * @param {Object[]} metrics - Derived metrics
 * @returns {Object} Benchmark averages
 */
function calculateBenchmarks(posts, metrics) {
  const saveRates = metrics.filter(m => m.saveRate !== null).map(m => m.saveRate);
  const reaches = metrics.filter(m => m.igReach !== null).map(m => m.igReach);
  const ytViews = metrics.filter(m => m.ytViews !== null).map(m => m.ytViews);
  
  return {
    avgSaveRate: saveRates.length > 0 ? saveRates.reduce((a, b) => a + b, 0) / saveRates.length : null,
    avgReach: reaches.length > 0 ? reaches.reduce((a, b) => a + b, 0) / reaches.length : null,
    avgYtViews: ytViews.length > 0 ? ytViews.reduce((a, b) => a + b, 0) / ytViews.length : null,
  };
}

/**
 * Generate all insights from posts
 * @param {Object[]} posts - Posts with metrics
 * @param {Object[]} metrics - Derived metrics
 * @param {Object} confidence - Confidence level
 * @returns {Object} Generated insights
 */
export function generateInsights(posts, metrics, confidence) {
  return {
    pillarRankings: rankPillarsBySaveRate(posts, metrics),
    hookAnalysis: analyzeHooks(metrics),
    platformComparison: comparePlatforms(posts),
    bestPost: findBestPost(posts, metrics),
    benchmarks: calculateBenchmarks(posts, metrics),
    confidence,
    postsWithMetrics: posts.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format percentage for display
 * @param {number|null} rate - Rate as decimal
 * @returns {string} Formatted percentage
 */
function formatPct(rate) {
  if (rate === null) return 'N/A';
  return (rate * 100).toFixed(1) + '%';
}

/**
 * Generate the performance-context.md file content
 * @param {Object} insights - Generated insights
 * @param {Object} confidence - Confidence level
 * @param {Object[]} allPosts - All posts (including those without metrics)
 * @returns {string} Markdown content
 */
function generatePerformanceContextMd(insights, confidence, allPosts) {
  const today = new Date().toISOString().slice(0, 10);
  const nextSunday = new Date();
  nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
  const nextPull = nextSunday.toISOString().slice(0, 10);
  
  const postsWithMetrics = allPosts.filter(p => p.metricsCollectedAt);
  const postsTooNew = allPosts.filter(p => !p.metricsCollectedAt && (p.igMediaId || p.ytVideoId));
  const postsMissingIds = allPosts.filter(p => !p.igMediaId && !p.ytVideoId);
  
  let md = `# Performance Context — @toolsforbuilders
Last updated: ${today}
Data confidence: ${confidence.label.toUpperCase()} (${insights.postsWithMetrics} post${insights.postsWithMetrics !== 1 ? 's' : ''} with metrics)

`;
  
  // Insufficient data warning
  if (confidence.label === 'insufficient') {
    md += `## ⚠️ Insufficient Data

${confidence.message}

With only ${insights.postsWithMetrics} post(s) with metrics, we cannot draw meaningful conclusions yet. Continue posting and collecting data.

**Recommendation:** Test all pillars equally. Don't optimize based on insufficient signal.

`;
  } else {
    // What's Working section
    md += `## What's Working

`;
    
    // Pillar rankings
    if (insights.pillarRankings.length > 0) {
      md += `- **Save rate by pillar** (n=${insights.postsWithMetrics}, ${confidence.label} confidence):\n`;
      for (const p of insights.pillarRankings) {
        md += `  - ${p.pillar}: ${formatPct(p.avgSaveRate)} save rate (${p.count} post${p.count !== 1 ? 's' : ''})\n`;
      }
      if (confidence.label === 'low') {
        md += `  - ⚠️ Low sample size — directional only\n`;
      }
      md += '\n';
    }
    
    // Hook analysis
    const hooks = insights.hookAnalysis;
    if (hooks.withNumbers.count > 0 || hooks.withoutNumbers.count > 0) {
      md += `- **Hook style analysis:**\n`;
      if (hooks.withNumbers.count > 0) {
        md += `  - Hooks with numbers: ${formatPct(hooks.withNumbers.avgSaveRate)} save rate (${hooks.withNumbers.count} post${hooks.withNumbers.count !== 1 ? 's' : ''})\n`;
      }
      if (hooks.withoutNumbers.count > 0) {
        md += `  - Qualitative hooks: ${formatPct(hooks.withoutNumbers.avgSaveRate)} save rate (${hooks.withoutNumbers.count} post${hooks.withoutNumbers.count !== 1 ? 's' : ''})\n`;
      }
      md += '\n';
    }
    
    // Best post
    if (insights.bestPost) {
      md += `- **Best performing post:** "${insights.bestPost.topic}" (${insights.bestPost.pillar})\n`;
      md += `  - Save rate: ${formatPct(insights.bestPost.saveRate)} | Reach: ${insights.bestPost.reach}\n\n`;
    }
    
    // Recommendations
    md += `## Recommendations for This Week

`;
    
    if (confidence.label === 'low' || confidence.label === 'insufficient') {
      md += `- Continue testing all pillars equally — not enough data to specialize\n`;
    } else if (insights.pillarRankings.length > 0) {
      const topPillar = insights.pillarRankings[0];
      md += `- Prioritize **${topPillar.pillar}** pillar (leading at ${formatPct(topPillar.avgSaveRate)} save rate)\n`;
    }
    
    if (hooks.withNumbers.avgSaveRate !== null && hooks.withoutNumbers.avgSaveRate !== null) {
      if (hooks.withNumbers.avgSaveRate > hooks.withoutNumbers.avgSaveRate) {
        md += `- Hooks with specific numbers outperforming — maintain concrete numbers in hooks\n`;
      } else {
        md += `- Qualitative hooks performing well — don't force numbers where they don't fit\n`;
      }
    }
    
    const benchmarks = insights.benchmarks;
    if (benchmarks.avgSaveRate !== null && benchmarks.avgSaveRate < 0.03) {
      md += `- Save rate below 3% — focus on stronger CTAs and more actionable content\n`;
    }
    
    md += '\n';
  }
  
  // Raw Benchmarks
  md += `## Raw Benchmarks (for reference)
`;
  const benchmarks = insights.benchmarks;
  md += `- Average IG save rate: ${formatPct(benchmarks.avgSaveRate)}\n`;
  md += `- Average IG reach: ${benchmarks.avgReach !== null ? Math.round(benchmarks.avgReach) : 'N/A'}\n`;
  md += `- Average YT views: ${benchmarks.avgYtViews !== null ? Math.round(benchmarks.avgYtViews) : 'N/A'}\n\n`;
  
  // Data Notes
  md += `## Data Notes
- Posts with metrics: ${postsWithMetrics.length} of ${allPosts.length} total
- Posts too new (<7 days): ${postsTooNew.length}
- Posts missing media IDs: ${postsMissingIds.length}
- Next data pull: Sunday ${nextPull}

`;
  
  // TikTok Data
  md += `## TikTok Data
No TikTok metrics yet — manual data pending from Lennart.
`;
  
  return md;
}

/**
 * Write performance context to file
 * @param {Object} insights - Generated insights
 * @param {Object} confidence - Confidence level
 * @param {Object[]} allPosts - All posts
 */
function writePerformanceContext(insights, confidence, allPosts) {
  const content = generatePerformanceContextMd(insights, confidence, allPosts);
  writeFileSync(PATHS.perfContext, content);
  console.log(`📝 Written: ${PATHS.perfContext}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main interpretation function
 * @returns {Object} { insights, confidence, postCount }
 */
export async function interpretAnalytics() {
  console.log('🔍 Interpreting analytics...');
  
  const allPosts = loadPerformanceLogs();
  const postsWithMetrics = getPostsWithMetrics(allPosts);
  
  console.log(`   Total posts: ${allPosts.length}`);
  console.log(`   Posts with metrics: ${postsWithMetrics.length}`);
  
  const confidence = getConfidence(postsWithMetrics.length);
  console.log(`   Confidence level: ${confidence.label.toUpperCase()}`);
  
  const metrics = postsWithMetrics.map(deriveMetrics);
  const insights = generateInsights(postsWithMetrics, metrics, confidence);
  
  writePerformanceContext(insights, confidence, allPosts);
  
  console.log('✅ Analytics interpretation complete.');
  
  return { insights, confidence, postCount: postsWithMetrics.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await interpretAnalytics();
}

// Only run main if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('🔥 Analytics interpretation failed:', err);
    process.exit(1);
  });
}
