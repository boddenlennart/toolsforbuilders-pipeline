#!/usr/bin/env node
/**
 * parity.test.mjs — Tests that caption/content generation is consistent.
 * Now imports from the unified caption-framework.mjs (single source of truth).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  generateInstagramCaption,
  generateYouTubeContent,
  generateTikTokCaption,
  generatePlatformContent,
  PILLAR_TAGS,
  BRAND_TAG,
} from '../instagram/caption-framework.mjs';

// Sample script for testing
const MOCK_SCRIPT = {
  id: 'test-parity-script',
  pillar: 'Workflow',
  topic: 'Research workflow with Perplexity',
  hookHeadline: 'Stop searching manually',
  hookSub: 'Let AI do it',
  hookTTS: 'Stop searching manually. Let AI research for you.',
  agitateMain: 'You waste hours',
  agitateBridge: 'There is a better way',
  agitateTTS: 'You waste hours every week searching. There is a better way.',
  points: [
    { toolName: 'Perplexity', verdict: 'Best for research', tts: 'Use Perplexity for deep research.', bullets: ['Open Perplexity', 'Ask your question', 'Get cited answers'] },
    { toolName: 'Claude', verdict: 'Best for writing', tts: 'Use Claude for writing.', bullets: ['Paste the research', 'Ask for a summary', 'Edit the output'] },
  ],
  proofStat: '10 hours saved per week',
  proofTTS: 'I save ten hours per week using this workflow.',
  ctaTTS: 'Save this before you forget it. I drop one of these every day.',
  claims: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Archive/Performance log entry generators (same in both scripts)
// ─────────────────────────────────────────────────────────────────────────────

function generateArchiveEntry(script, postResults) {
  return {
    id: script.id,
    pillar: script.pillar,
    topic: script.topic,
    hookHeadline: script.hookHeadline || null,
    postedAt: new Date().toISOString(),
    platforms: postResults,
  };
}

function generatePerfLogEntry(script, postResults) {
  return {
    ts: new Date().toISOString(),
    scriptId: script.id,
    pillar: script.pillar,
    topic: script.topic,
    hookHeadline: script.hookHeadline || script.topic,
    postedAt: new Date().toISOString(),
    igMediaId: postResults.instagram?.mediaId || null,
    ytVideoId: postResults.youtube?.videoId || null,
    tiktokManual: postResults.tiktok?.manual || false,
    metricsCollectedAt: null,
    daysAfterPost: null,
    instagram: null,
    youtube: null,
    tiktok: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Now testing the unified caption framework directly
// ─────────────────────────────────────────────────────────────────────────────

describe('Caption Framework Parity', () => {
  test('generatePlatformContent returns all platforms', () => {
    const content = generatePlatformContent(MOCK_SCRIPT);
    assert.ok(content.instagram, 'Should have instagram');
    assert.ok(content.youtube, 'Should have youtube');
    assert.ok(content.tiktok, 'Should have tiktok');
  });

  test('Instagram caption from framework matches direct call', () => {
    const fromFramework = generatePlatformContent(MOCK_SCRIPT).instagram.caption;
    const direct = generateInstagramCaption(MOCK_SCRIPT);
    assert.strictEqual(fromFramework, direct, 'Framework and direct call should match');
  });

  test('YouTube content from framework matches direct call', () => {
    const fromFramework = generatePlatformContent(MOCK_SCRIPT).youtube;
    const direct = generateYouTubeContent(MOCK_SCRIPT);
    assert.strictEqual(fromFramework.title, direct.title, 'YouTube titles should match');
    assert.strictEqual(fromFramework.description, direct.description, 'YouTube descriptions should match');
    assert.deepStrictEqual(fromFramework.backendTags, direct.backendTags, 'YouTube backendTags should match');
  });

  test('TikTok caption from framework matches direct call', () => {
    const fromFramework = generatePlatformContent(MOCK_SCRIPT).tiktok.caption;
    const direct = generateTikTokCaption(MOCK_SCRIPT);
    assert.strictEqual(fromFramework, direct, 'Framework and direct call should match');
  });
});

describe('Instagram Caption Parity', () => {
  test('Instagram caption has pillar emoji', () => {
    const caption = generateInstagramCaption(MOCK_SCRIPT);
    assert.ok(caption.startsWith('⚙️'), 'Workflow pillar should use ⚙️ emoji');
  });

  test('Instagram caption has topic', () => {
    const caption = generateInstagramCaption(MOCK_SCRIPT);
    assert.ok(caption.includes(MOCK_SCRIPT.topic), 'Caption should include topic');
  });

  test('Instagram caption has tool names', () => {
    const caption = generateInstagramCaption(MOCK_SCRIPT);
    assert.ok(caption.includes('Perplexity'), 'Caption should include tool names');
    assert.ok(caption.includes('Claude'), 'Caption should include tool names');
  });

  test('Instagram caption has CTA', () => {
    const caption = generateInstagramCaption(MOCK_SCRIPT);
    assert.ok(caption.includes('Save this'), 'Caption should include save CTA');
    assert.ok(caption.includes('@toolsforbuilders'), 'Caption should include brand');
  });

  test('Instagram caption has correct hashtag count', () => {
    const caption = generateInstagramCaption(MOCK_SCRIPT);
    const hashtags = caption.match(/#\w+/g) || [];
    assert.ok(hashtags.length >= 4 && hashtags.length <= 12, `Hashtag count should be 4-12, got ${hashtags.length}`);
  });
});

describe('TikTok Caption Parity', () => {
  test('TikTok caption starts with hook', () => {
    const caption = generateTikTokCaption(MOCK_SCRIPT);
    assert.ok(caption.startsWith('Stop searching manually'), 'TikTok should start with first sentence of hookTTS');
  });

  test('TikTok caption has tool line', () => {
    const caption = generateTikTokCaption(MOCK_SCRIPT);
    assert.ok(caption.includes('Tools:'), 'TikTok should include Tools: line');
  });

  test('TikTok caption has max 5 hashtags', () => {
    const caption = generateTikTokCaption(MOCK_SCRIPT);
    const hashtags = caption.match(/#\w+/g) || [];
    assert.ok(hashtags.length <= 5, `TikTok hashtag count should be ≤5, got ${hashtags.length}`);
  });

  test('TikTok caption has TikTok-specific tags', () => {
    const caption = generateTikTokCaption(MOCK_SCRIPT);
    assert.ok(caption.includes('#LearnOnTikTok'), 'TikTok should include #LearnOnTikTok');
    assert.ok(caption.includes('#TikTokTips'), 'TikTok should include #TikTokTips');
  });

  test('TikTok caption does NOT have IG-specific tags', () => {
    const caption = generateTikTokCaption(MOCK_SCRIPT);
    assert.ok(!caption.includes('#workflowautomation'), 'TikTok should NOT include #workflowautomation');
    assert.ok(!caption.includes('#digitalnomadlife'), 'TikTok should NOT include #digitalnomadlife');
  });
});

describe('YouTube Description Parity', () => {
  test('YouTube title includes #Shorts', () => {
    const { title } = generateYouTubeContent(MOCK_SCRIPT);
    assert.ok(title.includes('#Shorts'), 'YouTube title should include #Shorts');
  });

  test('YouTube title is ≤100 characters', () => {
    const { title } = generateYouTubeContent(MOCK_SCRIPT);
    assert.ok(title.length <= 100, `YouTube title should be ≤100 chars, got ${title.length}`);
  });

  test('YouTube description has subscribe CTA', () => {
    const { description } = generateYouTubeContent(MOCK_SCRIPT);
    assert.ok(description.includes('Subscribe'), 'YouTube description should include subscribe CTA');
  });

  test('YouTube description has max 5 hashtags', () => {
    const { description } = generateYouTubeContent(MOCK_SCRIPT);
    const hashtags = description.match(/#\w+/g) || [];
    assert.ok(hashtags.length <= 5, `YouTube hashtag count should be ≤5, got ${hashtags.length}`);
  });

  test('YouTube backendTags is an array', () => {
    const { backendTags } = generateYouTubeContent(MOCK_SCRIPT);
    assert.ok(Array.isArray(backendTags), 'backendTags should be an array');
  });
});

describe('Archive Entry Parity', () => {
  test('Archive entry has required fields', () => {
    const mockResults = {
      instagram: { success: true, mediaId: '123' },
      youtube: { success: true, videoId: 'abc' },
      tiktok: { success: true, manual: true },
    };
    const entry = generateArchiveEntry(MOCK_SCRIPT, mockResults);
    
    assert.ok(entry.id, 'Archive entry should have id');
    assert.ok(entry.pillar, 'Archive entry should have pillar');
    assert.ok(entry.topic, 'Archive entry should have topic');
    assert.ok(entry.postedAt, 'Archive entry should have postedAt');
    assert.ok(entry.platforms, 'Archive entry should have platforms');
  });

  test('Archive entry does NOT have full script dump', () => {
    const mockResults = {
      instagram: { success: true, mediaId: '123' },
      youtube: { success: true, videoId: 'abc' },
      tiktok: { success: true, manual: true },
    };
    const entry = generateArchiveEntry(MOCK_SCRIPT, mockResults);
    
    assert.ok(!entry.hookTTS, 'Archive entry should NOT include hookTTS');
    assert.ok(!entry.points, 'Archive entry should NOT include points array');
    assert.ok(!entry.agitateTTS, 'Archive entry should NOT include agitateTTS');
  });
});

describe('Performance Log Entry Parity', () => {
  test('Perf log entry has required fields', () => {
    const mockResults = {
      instagram: { success: true, mediaId: '123' },
      youtube: { success: true, videoId: 'abc' },
      tiktok: { success: true, manual: true },
    };
    const entry = generatePerfLogEntry(MOCK_SCRIPT, mockResults);
    
    assert.ok(entry.ts, 'Perf log should have ts');
    assert.ok(entry.scriptId, 'Perf log should have scriptId');
    assert.ok(entry.pillar, 'Perf log should have pillar');
    assert.ok(entry.topic, 'Perf log should have topic');
    assert.ok(entry.hookHeadline, 'Perf log should have hookHeadline');
    assert.strictEqual(entry.igMediaId, '123', 'Perf log should have igMediaId');
    assert.strictEqual(entry.ytVideoId, 'abc', 'Perf log should have ytVideoId');
    assert.strictEqual(entry.tiktokManual, true, 'Perf log should have tiktokManual');
    assert.strictEqual(entry.metricsCollectedAt, null, 'Perf log metricsCollectedAt should be null initially');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export for preflight check
// ─────────────────────────────────────────────────────────────────────────────

export async function runParityCheck() {
  const failures = [];
  
  try {
    // Test unified framework
    const content = generatePlatformContent(MOCK_SCRIPT);
    
    // Test Instagram
    const caption = content.instagram.caption;
    if (!caption.startsWith('⚙️')) failures.push('Instagram caption missing pillar emoji');
    if (!caption.includes(MOCK_SCRIPT.topic)) failures.push('Instagram caption missing topic');
    
    // Test TikTok
    const tikTok = content.tiktok.caption;
    if (!tikTok.includes('Tools:')) failures.push('TikTok caption missing tools line');
    if (!tikTok.includes('#LearnOnTikTok')) failures.push('TikTok caption missing #LearnOnTikTok');
    if (tikTok.includes('#workflowautomation')) failures.push('TikTok has IG-specific tag');
    
    // Test YouTube
    const { title, description } = content.youtube;
    if (!title.includes('#Shorts')) failures.push('YouTube title missing #Shorts');
    if (!description.includes('Subscribe')) failures.push('YouTube description missing Subscribe');
    
    // Test archive entry structure
    const entry = generateArchiveEntry(MOCK_SCRIPT, {});
    if (entry.hookTTS || entry.points) failures.push('Archive entry has bloated fields');
    
    return {
      passed: failures.length === 0,
      failures,
    };
  } catch (e) {
    return {
      passed: false,
      failures: [e.message],
    };
  }
}
