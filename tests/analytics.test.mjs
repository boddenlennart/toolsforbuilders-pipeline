#!/usr/bin/env node
/**
 * analytics.test.mjs — Tests for analytics-pull.mjs and analytics-interpret.mjs
 * 
 * Run: node --test /root/.openclaw/workspace/scripts/tests/analytics.test.mjs
 */

import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import modules under test
import {
  CONFIDENCE,
  getConfidence,
  hasNumber,
  deriveMetrics,
  generateInsights,
  loadPerformanceLogs,
  getPostsWithMetrics,
} from '../analytics-interpret.mjs';

import {
  daysSincePost,
  checkPostDue,
} from '../analytics-pull.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Factory
// ─────────────────────────────────────────────────────────────────────────────

function createMockPost(overrides = {}) {
  const now = new Date();
  const posted = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago
  
  return {
    ts: posted.toISOString(),
    scriptId: `reel-test-${Math.random().toString(36).slice(2, 8)}`,
    pillar: 'Workflow',
    topic: 'Test topic for unit testing',
    hookHeadline: 'Default hook headline',
    postedAt: posted.toISOString(),
    igMediaId: '17841234567890',
    ytVideoId: 'dQw4w9WgXcQ',
    tiktokManual: false,
    metricsCollectedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    daysAfterPost: 8,
    instagram: {
      reach: 987,
      impressions: 1234,
      saved: 45,
      shares: 12,
      profileVisits: 8,
      likes: 23,
      comments: 2,
    },
    youtube: {
      views: 134,
      likes: 8,
      comments: 1,
      subscribersGained: 3,
      avgViewDuration: 28,
    },
    tiktok: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: No data — interpretAnalytics with 0 posts
// ─────────────────────────────────────────────────────────────────────────────

describe('Confidence Levels', () => {
  test('No data returns INSUFFICIENT confidence', () => {
    const confidence = getConfidence(0);
    assert.equal(confidence.label, 'insufficient');
    assert.equal(confidence.message, 'Too early for patterns — collecting baseline');
  });

  test('1-2 posts return INSUFFICIENT confidence', () => {
    assert.equal(getConfidence(1).label, 'insufficient');
    assert.equal(getConfidence(2).label, 'insufficient');
  });

  test('3-6 posts return LOW confidence', () => {
    assert.equal(getConfidence(3).label, 'low');
    assert.equal(getConfidence(6).label, 'low');
  });

  test('7-14 posts return MEDIUM confidence', () => {
    assert.equal(getConfidence(7).label, 'medium');
    assert.equal(getConfidence(14).label, 'medium');
  });

  test('15+ posts return HIGH confidence', () => {
    assert.equal(getConfidence(15).label, 'high');
    assert.equal(getConfidence(100).label, 'high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Single post — correct metric calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Single Post Metrics', () => {
  test('Save rate calculation is correct', () => {
    const post = createMockPost();
    const metrics = deriveMetrics(post);
    
    // saved (45) / reach (987) = 0.0456...
    assert.ok(Math.abs(metrics.saveRate - 0.0456) < 0.001);
  });

  test('Profile visit rate calculation is correct', () => {
    const post = createMockPost();
    const metrics = deriveMetrics(post);
    
    // profileVisits (8) / reach (987) = 0.0081...
    assert.ok(Math.abs(metrics.profileVisitRate - 0.0081) < 0.001);
  });

  test('Engagement rate calculation is correct', () => {
    const post = createMockPost();
    const metrics = deriveMetrics(post);
    
    // (likes 23 + comments 2 + saved 45 + shares 12) / reach 987 = 82/987 = 0.0831...
    assert.ok(Math.abs(metrics.engagementRate - 0.0831) < 0.001);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Sparse pillar ranking — 3 posts across 3 pillars
// ─────────────────────────────────────────────────────────────────────────────

describe('Sparse Pillar Ranking', () => {
  test('3 posts across 3 pillars with LOW confidence', () => {
    const posts = [
      createMockPost({ pillar: 'Workflow', instagram: { reach: 1000, saved: 42, likes: 10, comments: 1, shares: 5, profileVisits: 3 } }),
      createMockPost({ pillar: 'Comparison', instagram: { reach: 1000, saved: 38, likes: 15, comments: 2, shares: 8, profileVisits: 5 } }),
      createMockPost({ pillar: 'Hidden Feature', instagram: { reach: 1000, saved: 21, likes: 8, comments: 0, shares: 3, profileVisits: 2 } }),
    ];
    
    const metrics = posts.map(deriveMetrics);
    const confidence = getConfidence(posts.length);
    const insights = generateInsights(posts, metrics, confidence);
    
    assert.equal(confidence.label, 'low');
    assert.equal(insights.pillarRankings.length, 3);
    
    // Workflow has highest save rate (42/1000)
    assert.equal(insights.pillarRankings[0].pillar, 'Workflow');
    assert.ok(Math.abs(insights.pillarRankings[0].avgSaveRate - 0.042) < 0.001);
    
    // Hidden Feature has lowest save rate (21/1000)
    assert.equal(insights.pillarRankings[2].pillar, 'Hidden Feature');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Enough data — 10 mock posts, HIGH confidence
// ─────────────────────────────────────────────────────────────────────────────

describe('Sufficient Data', () => {
  test('10+ posts return meaningful pillar comparison', () => {
    const posts = [];
    const pillars = ['Workflow', 'Comparison', 'Hidden Feature', 'Time/Money Math', 'Myth Bust'];
    
    // Create 15 posts (HIGH confidence)
    for (let i = 0; i < 15; i++) {
      posts.push(createMockPost({
        pillar: pillars[i % pillars.length],
        instagram: { reach: 1000, saved: 30 + (i % 5) * 5, likes: 10, comments: 1, shares: 2, profileVisits: 3 },
      }));
    }
    
    const metrics = posts.map(deriveMetrics);
    const confidence = getConfidence(posts.length);
    const insights = generateInsights(posts, metrics, confidence);
    
    assert.equal(confidence.label, 'high');
    assert.equal(insights.postsWithMetrics, 15);
    assert.ok(insights.pillarRankings.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Missing data fields — post with null instagram metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('Missing Data Fields', () => {
  test('Post with null instagram metrics does not crash', () => {
    const post = createMockPost({ instagram: null });
    
    // Should not throw
    const metrics = deriveMetrics(post);
    
    assert.equal(metrics.saveRate, null);
    assert.equal(metrics.profileVisitRate, null);
    assert.equal(metrics.engagementRate, null);
    assert.equal(metrics.ytViews, 134); // YouTube still works
  });

  test('Post with null youtube metrics does not crash', () => {
    const post = createMockPost({ youtube: null });
    const metrics = deriveMetrics(post);
    
    assert.equal(metrics.ytViewsPerDay, null);
    assert.equal(metrics.ytSubsPerKViews, null);
    assert.ok(metrics.saveRate !== null); // Instagram still works
  });

  test('Post with both null platforms does not crash', () => {
    const post = createMockPost({ instagram: null, youtube: null });
    const metrics = deriveMetrics(post);
    
    assert.equal(metrics.saveRate, null);
    assert.equal(metrics.ytViewsPerDay, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Save rate calculation — exact math verification
// ─────────────────────────────────────────────────────────────────────────────

describe('Save Rate Exact Math', () => {
  test('45 saves / 987 reach = 0.0456 (4.56%)', () => {
    const post = createMockPost({
      instagram: { reach: 987, saved: 45, likes: 0, comments: 0, shares: 0, profileVisits: 0 },
    });
    
    const metrics = deriveMetrics(post);
    const expected = 45 / 987;
    
    assert.equal(metrics.saveRate, expected);
    assert.ok(Math.abs(metrics.saveRate - 0.0456) < 0.0001);
  });

  test('Zero reach returns null (avoid division by zero)', () => {
    const post = createMockPost({
      instagram: { reach: 0, saved: 45, likes: 10, comments: 2, shares: 5, profileVisits: 3 },
    });
    
    const metrics = deriveMetrics(post);
    
    // Division by zero protection
    assert.equal(metrics.saveRate, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Hook number detection
// ─────────────────────────────────────────────────────────────────────────────

describe('Hook Number Detection', () => {
  test('"Save $10/month" has number', () => {
    assert.equal(hasNumber('Save $10/month'), true);
  });

  test('"Quick workflow tip" has no number', () => {
    assert.equal(hasNumber('Quick workflow tip'), false);
  });

  test('"5 tools you need" has number', () => {
    assert.equal(hasNumber('5 tools you need'), true);
  });

  test('"Save 50% on your workflow" has number', () => {
    assert.equal(hasNumber('Save 50% on your workflow'), true);
  });

  test('null headline returns false', () => {
    assert.equal(hasNumber(null), false);
  });

  test('empty string returns false', () => {
    assert.equal(hasNumber(''), false);
  });

  test('deriveMetrics correctly sets hookHasNumber', () => {
    const postWithNumber = createMockPost({ hookHeadline: 'Save $10/month' });
    const postWithoutNumber = createMockPost({ hookHeadline: 'Quick workflow tip' });
    
    assert.equal(deriveMetrics(postWithNumber).hookHasNumber, true);
    assert.equal(deriveMetrics(postWithoutNumber).hookHasNumber, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Profile visit rate — correct calculation and null handling
// ─────────────────────────────────────────────────────────────────────────────

describe('Profile Visit Rate', () => {
  test('Profile visit rate calculation is correct', () => {
    const post = createMockPost({
      instagram: { reach: 1000, saved: 20, likes: 10, comments: 1, shares: 5, profileVisits: 15 },
    });
    
    const metrics = deriveMetrics(post);
    
    // 15 / 1000 = 0.015 (1.5%)
    assert.equal(metrics.profileVisitRate, 0.015);
  });

  test('Profile visit rate is null when reach is zero', () => {
    const post = createMockPost({
      instagram: { reach: 0, saved: 20, likes: 10, comments: 1, shares: 5, profileVisits: 15 },
    });
    
    const metrics = deriveMetrics(post);
    assert.equal(metrics.profileVisitRate, null);
  });

  test('Profile visit rate is null when instagram is null', () => {
    const post = createMockPost({ instagram: null });
    const metrics = deriveMetrics(post);
    assert.equal(metrics.profileVisitRate, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Performance context output — contains correct confidence label
// ─────────────────────────────────────────────────────────────────────────────

describe('Performance Context Output', () => {
  test('generateInsights includes correct confidence', () => {
    const posts = [
      createMockPost({ pillar: 'Workflow' }),
      createMockPost({ pillar: 'Comparison' }),
      createMockPost({ pillar: 'Hidden Feature' }),
    ];
    
    const metrics = posts.map(deriveMetrics);
    const confidence = getConfidence(posts.length);
    const insights = generateInsights(posts, metrics, confidence);
    
    assert.equal(insights.confidence.label, 'low');
    assert.equal(insights.postsWithMetrics, 3);
  });

  test('Zero posts generates INSUFFICIENT insights', () => {
    const posts = [];
    const metrics = [];
    const confidence = getConfidence(0);
    const insights = generateInsights(posts, metrics, confidence);
    
    assert.equal(insights.confidence.label, 'insufficient');
    assert.equal(insights.postsWithMetrics, 0);
    assert.equal(insights.pillarRankings.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Stale check — post 8 days old is due, post 3 days old is not
// ─────────────────────────────────────────────────────────────────────────────

describe('Post Due Check', () => {
  test('Post 8 days old is due for analytics', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      postedAt: eightDaysAgo,
      igMediaId: '12345',
      ytVideoId: null,
      metricsCollectedAt: null,
    };
    
    const { due, reason } = checkPostDue(entry, false);
    assert.equal(due, true);
    assert.equal(reason, 'never_fetched');
  });

  test('Post 3 days old is NOT due for analytics', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      postedAt: threeDaysAgo,
      igMediaId: '12345',
      ytVideoId: null,
      metricsCollectedAt: null,
    };
    
    const { due, reason } = checkPostDue(entry, false);
    assert.equal(due, false);
    assert.equal(reason, 'too_new');
  });

  test('Post without media IDs is not due', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      postedAt: eightDaysAgo,
      igMediaId: null,
      ytVideoId: null,
      metricsCollectedAt: null,
    };
    
    const { due, reason } = checkPostDue(entry, false);
    assert.equal(due, false);
    assert.equal(reason, 'no_media_ids');
  });

  test('Post > 30 days old is not due (unless forced)', () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      postedAt: fortyDaysAgo,
      igMediaId: '12345',
      ytVideoId: null,
      metricsCollectedAt: null,
    };
    
    const { due: normalDue, reason: normalReason } = checkPostDue(entry, false);
    assert.equal(normalDue, false);
    assert.equal(normalReason, 'too_old');
    
    const { due: forceDue } = checkPostDue(entry, true);
    assert.equal(forceDue, true);
  });

  test('Recently fetched post is not due', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      postedAt: tenDaysAgo,
      igMediaId: '12345',
      ytVideoId: null,
      metricsCollectedAt: twoDaysAgo,
    };
    
    const { due, reason } = checkPostDue(entry, false);
    assert.equal(due, false);
    assert.equal(reason, 'up_to_date');
  });

  test('Post with stale metrics is due', () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      postedAt: twentyDaysAgo,
      igMediaId: '12345',
      ytVideoId: null,
      metricsCollectedAt: tenDaysAgo,
    };
    
    const { due, reason } = checkPostDue(entry, false);
    assert.equal(due, true);
    assert.equal(reason, 'stale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Days since post calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Days Since Post', () => {
  test('daysSincePost returns correct number of days', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const days = daysSincePost(fiveDaysAgo);
    assert.equal(days, 5);
  });

  test('daysSincePost returns 0 for today', () => {
    const now = new Date().toISOString();
    const days = daysSincePost(now);
    assert.equal(days, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: getPostsWithMetrics filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('Posts With Metrics Filtering', () => {
  test('Filters posts that have metricsCollectedAt', () => {
    const posts = [
      createMockPost({ metricsCollectedAt: new Date().toISOString() }),
      createMockPost({ metricsCollectedAt: null, instagram: null }),
      createMockPost({ metricsCollectedAt: new Date().toISOString() }),
    ];
    
    const withMetrics = getPostsWithMetrics(posts);
    assert.equal(withMetrics.length, 2);
  });

  test('Filters posts that have instagram or youtube data', () => {
    const posts = [
      createMockPost({ metricsCollectedAt: new Date().toISOString(), instagram: null, youtube: null }),
      createMockPost({ metricsCollectedAt: new Date().toISOString() }),
    ];
    
    const withMetrics = getPostsWithMetrics(posts);
    assert.equal(withMetrics.length, 1);
  });
});

console.log('All analytics tests defined. Running...');
