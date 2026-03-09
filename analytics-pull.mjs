#!/usr/bin/env node
/**
 * analytics-pull.mjs — Pull performance metrics for published posts.
 * 
 * Usage:
 *   node analytics-pull.mjs          # Pull metrics for posts 7+ days old
 *   node analytics-pull.mjs --force  # Pull all posts regardless of age
 *   node analytics-pull.mjs --dry-run # Show what would be pulled
 * 
 * Reads:
 *   - instagram/.env.secrets for IG_ACCESS_TOKEN
 *   - youtube/youtube-token.json for YouTube OAuth
 *   - instagram/data/performance-log.jsonl for post list
 * 
 * Writes:
 *   - Updates instagram/data/performance-log.jsonl with metrics
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  igSecrets: join(__dirname, 'instagram/.env.secrets'),
  ytToken: join(__dirname, 'youtube/youtube-token.json'),
  perfLog: join(__dirname, 'instagram/data/performance-log.jsonl'),
};

// Configurable thresholds
const MIN_DAYS_FOR_METRICS = 7;   // Don't pull metrics until post is 7 days old
const MAX_DAYS_FOR_REFRESH = 30;  // Stop refreshing metrics after 30 days

// ─────────────────────────────────────────────────────────────────────────────
// Credential Loading
// ─────────────────────────────────────────────────────────────────────────────

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function getIgToken() {
  const env = loadEnvFile(PATHS.igSecrets);
  const token = env.IG_ACCESS_TOKEN;
  if (!token) throw new Error('IG_ACCESS_TOKEN not found in instagram/.env.secrets');
  return token;
}

function getYtToken() {
  if (!existsSync(PATHS.ytToken)) {
    throw new Error('youtube-token.json not found');
  }
  const tokenData = JSON.parse(readFileSync(PATHS.ytToken, 'utf8'));
  
  // Check if token is expired — Google OAuth uses 'expiry_date' (milliseconds)
  const now = Date.now();
  const expiryMs = tokenData.expiry_date || tokenData.expires_at; // support both field names
  if (expiryMs && expiryMs < now) {
    console.warn('⚠️ YouTube token appears expired. Run: node scripts/youtube/refresh-token.mjs');
    // Still return it — API call will fail gracefully
  }
  
  return tokenData.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance Log I/O
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all entries from performance-log.jsonl
 * @returns {Object[]} Array of log entries
 */
export function loadPerformanceLogs() {
  if (!existsSync(PATHS.perfLog)) return [];
  const lines = readFileSync(PATHS.perfLog, 'utf8').split('\n').filter(l => l.trim());
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      console.warn(`⚠️ Skipping malformed line in performance-log.jsonl`);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Save entries back to performance-log.jsonl
 * @param {Object[]} entries - Array of log entries
 */
function savePerformanceLogs(entries) {
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(PATHS.perfLog, content);
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch Instagram insights for a media ID
 * @param {string} mediaId - Instagram media ID
 * @param {string} token - Access token
 * @returns {Object|null} Metrics object or null on error
 */
async function fetchIgInsights(mediaId, token) {
  try {
    // Fetch insights (reach, impressions, saved, shares, profile_activity)
    const insightsUrl = `https://graph.facebook.com/v22.0/${mediaId}/insights?metric=impressions,reach,saved,shares,profile_activity&access_token=${token}`;
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();
    
    if (insightsData.error) {
      console.warn(`⚠️ IG insights error for ${mediaId}: ${insightsData.error.message}`);
      return null;
    }
    
    // Parse insights response
    const metrics = {
      reach: 0,
      impressions: 0,
      saved: 0,
      shares: 0,
      profileVisits: 0,
      likes: 0,
      comments: 0,
    };
    
    for (const item of insightsData.data || []) {
      const value = item.values?.[0]?.value || 0;
      switch (item.name) {
        case 'reach': metrics.reach = value; break;
        case 'impressions': metrics.impressions = value; break;
        case 'saved': metrics.saved = value; break;
        case 'shares': metrics.shares = value; break;
        case 'profile_activity': metrics.profileVisits = value; break;
      }
    }
    
    // Fetch like/comment counts (separate endpoint)
    const fieldsUrl = `https://graph.facebook.com/v22.0/${mediaId}?fields=like_count,comments_count&access_token=${token}`;
    const fieldsRes = await fetch(fieldsUrl);
    const fieldsData = await fieldsRes.json();
    
    if (!fieldsData.error) {
      metrics.likes = fieldsData.like_count || 0;
      metrics.comments = fieldsData.comments_count || 0;
    }
    
    return metrics;
  } catch (err) {
    console.warn(`⚠️ IG API error for ${mediaId}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch YouTube analytics for a video ID
 * Falls back to Data API if Analytics API not available
 * @param {string} videoId - YouTube video ID
 * @param {string} token - OAuth access token
 * @returns {Object|null} Metrics object or null on error
 */
async function fetchYtMetrics(videoId, token) {
  try {
    // Try YouTube Analytics API first (more detailed)
    const today = new Date().toISOString().slice(0, 10);
    const analyticsUrl = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&metrics=views,likes,comments,subscribersGained,averageViewDuration,estimatedMinutesWatched&dimensions=video&filters=video==${videoId}&startDate=2026-01-01&endDate=${today}`;
    
    const analyticsRes = await fetch(analyticsUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const analyticsData = await analyticsRes.json();
    
    // Analytics API success
    if (analyticsData.rows && analyticsData.rows.length > 0) {
      const row = analyticsData.rows[0];
      const columnHeaders = analyticsData.columnHeaders.map(h => h.name);
      const getValue = (name) => {
        const idx = columnHeaders.indexOf(name);
        return idx >= 0 ? row[idx] : 0;
      };
      
      return {
        views: getValue('views'),
        likes: getValue('likes'),
        comments: getValue('comments'),
        subscribersGained: getValue('subscribersGained'),
        avgViewDuration: getValue('averageViewDuration'),
        estimatedMinutesWatched: getValue('estimatedMinutesWatched'),
      };
    }
    
    // Analytics API failed or no scope — fall back to Data API
    if (analyticsData.error?.code === 403 || !analyticsData.rows) {
      console.log(`  📊 YT Analytics API not available, falling back to Data API...`);
      const dataUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=statistics&access_token=${token}`;
      const dataRes = await fetch(dataUrl);
      const dataData = await dataRes.json();
      
      if (dataData.error) {
        console.warn(`⚠️ YT Data API error for ${videoId}: ${dataData.error.message}`);
        return null;
      }
      
      const stats = dataData.items?.[0]?.statistics;
      if (!stats) {
        console.warn(`⚠️ No stats found for YT video ${videoId}`);
        return null;
      }
      
      return {
        views: parseInt(stats.viewCount || 0, 10),
        likes: parseInt(stats.likeCount || 0, 10),
        comments: parseInt(stats.commentCount || 0, 10),
        subscribersGained: null,  // Not available via Data API
        avgViewDuration: null,    // Not available via Data API
        estimatedMinutesWatched: null,
      };
    }
    
    // Some other error
    if (analyticsData.error) {
      console.warn(`⚠️ YT Analytics error for ${videoId}: ${analyticsData.error.message}`);
      return null;
    }
    
    return null;
  } catch (err) {
    console.warn(`⚠️ YT API error for ${videoId}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pull Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate days since a post was published
 * @param {string} postedAt - ISO date string
 * @returns {number} Days since post
 */
export function daysSincePost(postedAt) {
  const posted = new Date(postedAt);
  const now = new Date();
  return Math.floor((now - posted) / (1000 * 60 * 60 * 24));
}

/**
 * Check if a post is due for metrics pull
 * @param {Object} entry - Performance log entry
 * @param {boolean} force - Force pull regardless of age
 * @returns {{due: boolean, reason: string}}
 */
export function checkPostDue(entry, force = false) {
  const days = daysSincePost(entry.postedAt);
  
  // No media IDs to pull
  if (!entry.igMediaId && !entry.ytVideoId) {
    return { due: false, reason: 'no_media_ids' };
  }
  
  // Too old — stop refreshing
  if (days > MAX_DAYS_FOR_REFRESH && !force) {
    return { due: false, reason: 'too_old' };
  }
  
  // Too new — not ready for metrics
  if (days < MIN_DAYS_FOR_METRICS && !force) {
    return { due: false, reason: 'too_new' };
  }
  
  // Never fetched metrics
  if (!entry.metricsCollectedAt) {
    return { due: true, reason: 'never_fetched' };
  }
  
  // Last fetched more than 7 days ago and within refresh window
  const lastFetched = new Date(entry.metricsCollectedAt);
  const daysSinceFetch = Math.floor((Date.now() - lastFetched) / (1000 * 60 * 60 * 24));
  if (daysSinceFetch >= 7) {
    return { due: true, reason: 'stale' };
  }
  
  return { due: false, reason: 'up_to_date' };
}

/**
 * Pull analytics for all due posts
 * @param {Object} options - { force: boolean, dryRun: boolean }
 */
export async function pullAnalytics(options = {}) {
  const { force = false, dryRun = false } = options;
  
  console.log('📊 Analytics Pull Starting...');
  console.log(`   Mode: ${force ? 'FORCE' : 'normal'} | ${dryRun ? 'DRY RUN' : 'live'}`);
  
  const entries = loadPerformanceLogs();
  console.log(`   Found ${entries.length} posts in performance log`);
  
  if (entries.length === 0) {
    console.log('   No posts to process.');
    return { pulled: 0, skipped: 0, errors: 0 };
  }
  
  // Check which posts are due
  const duePosts = [];
  const skippedPosts = [];
  
  for (const entry of entries) {
    const { due, reason } = checkPostDue(entry, force);
    if (due) {
      duePosts.push({ entry, reason });
    } else {
      skippedPosts.push({ entry, reason });
    }
  }
  
  console.log(`   Due for pull: ${duePosts.length}`);
  console.log(`   Skipped: ${skippedPosts.length}`);
  
  // Log skip reasons
  const skipReasons = {};
  for (const { reason } of skippedPosts) {
    skipReasons[reason] = (skipReasons[reason] || 0) + 1;
  }
  if (Object.keys(skipReasons).length > 0) {
    console.log(`   Skip reasons: ${JSON.stringify(skipReasons)}`);
  }
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN — would pull:');
    for (const { entry, reason } of duePosts) {
      console.log(`   - ${entry.scriptId} (reason: ${reason})`);
      console.log(`     IG: ${entry.igMediaId || 'none'} | YT: ${entry.ytVideoId || 'none'}`);
    }
    return { pulled: 0, skipped: skippedPosts.length, errors: 0, dryRun: true };
  }
  
  // Load tokens
  let igToken = null;
  let ytToken = null;
  
  try {
    igToken = getIgToken();
  } catch (err) {
    console.warn(`⚠️ Could not load IG token: ${err.message}`);
  }
  
  try {
    ytToken = getYtToken();
  } catch (err) {
    console.warn(`⚠️ Could not load YT token: ${err.message}`);
  }
  
  // Pull metrics for due posts
  let pulled = 0;
  let errors = 0;
  
  for (const { entry } of duePosts) {
    console.log(`\n📈 Pulling: ${entry.scriptId}`);
    const days = daysSincePost(entry.postedAt);
    let updated = false;
    
    // Skip if both media IDs are null — don't waste API calls
    if (!entry.igMediaId && !entry.ytVideoId) {
      console.log(`   ⏭️ Skipping — no media IDs to pull metrics for`);
      continue;
    }
    
    // Instagram
    if (entry.igMediaId && igToken) {
      console.log(`   IG media: ${entry.igMediaId}...`);
      const igMetrics = await fetchIgInsights(entry.igMediaId, igToken);
      if (igMetrics) {
        entry.instagram = igMetrics;
        updated = true;
        console.log(`   ✅ IG: reach=${igMetrics.reach}, saved=${igMetrics.saved}`);
      } else {
        errors++;
      }
    } else if (!entry.igMediaId) {
      console.log(`   ⏭️ IG: no media ID — skipping`);
    }
    
    // YouTube
    if (entry.ytVideoId && ytToken) {
      console.log(`   YT video: ${entry.ytVideoId}...`);
      const ytMetrics = await fetchYtMetrics(entry.ytVideoId, ytToken);
      if (ytMetrics) {
        entry.youtube = ytMetrics;
        updated = true;
        console.log(`   ✅ YT: views=${ytMetrics.views}, likes=${ytMetrics.likes}`);
      } else {
        errors++;
      }
    } else if (!entry.ytVideoId) {
      console.log(`   ⏭️ YT: no video ID — skipping`);
    }
    
    if (updated) {
      entry.metricsCollectedAt = new Date().toISOString();
      entry.daysAfterPost = days;
      pulled++;
    }
  }
  
  // Save updated entries
  savePerformanceLogs(entries);
  console.log(`\n✅ Analytics pull complete. Pulled: ${pulled}, Skipped: ${skippedPosts.length}, Errors: ${errors}`);
  
  return { pulled, skipped: skippedPosts.length, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  
  await pullAnalytics({ force, dryRun });
}

// Only run main if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('🔥 Analytics pull failed:', err);
    process.exit(1);
  });
}
