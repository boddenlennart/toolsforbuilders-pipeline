#!/usr/bin/env node
/**
 * caption-framework.test.mjs — Unit tests for the unified caption framework.
 * Tests Instagram, YouTube, and TikTok content generation.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  generateInstagramCaption,
  generateYouTubeContent,
  generateTikTokCaption,
  generatePlatformContent,
  TOOL_TAGS,
  PILLAR_TAGS,
  TIER_1_TAGS,
  TIER_2_BY_PILLAR,
  TIKTOK_CORE_TAGS,
  BRAND_TAG,
  buildTags,
} from '../instagram/caption-framework.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Scripts for Testing
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SINGLE_TOOL_SCRIPT = {
  id: 'test-single-tool',
  pillar: 'Workflow',
  topic: 'Research workflow with Perplexity',
  hookHeadline: 'Stop searching manually',
  hookSub: 'Let AI do it',
  hookTTS: 'Stop searching manually. Let AI research for you.',
  agitateTTS: 'You waste hours every week searching.',
  points: [
    { toolName: 'Perplexity', verdict: 'Best for research', tts: 'Use Perplexity for deep research.' },
  ],
  proofTTS: 'I save ten hours per week using this workflow.',
  ctaTTS: 'Save this before you forget it.',
};

const MOCK_COMPARISON_SCRIPT = {
  id: 'test-comparison',
  pillar: 'Comparison',
  topic: 'Perplexity vs Gemini Deep Research — Which Is Better?',
  hookHeadline: 'Which research tool wins?',
  hookSub: 'Head to head comparison',
  hookTTS: 'Two AI research tools. One clear winner. Here is the breakdown.',
  points: [
    { toolName: 'Perplexity', verdict: 'Best for quick answers', tts: 'Perplexity gives fast cited answers.' },
    { toolName: 'Gemini Deep Research', verdict: 'Best for deep dives', tts: 'Gemini goes deeper but slower.' },
  ],
  ctaTTS: 'Save this comparison.',
};

const MOCK_NO_TOOLS_SCRIPT = {
  id: 'test-no-tools',
  pillar: 'Myth Bust',
  topic: 'AI won\'t replace you — but someone using AI will',
  hookHeadline: 'The truth about AI replacement',
  hookTTS: 'AI is not coming for your job. Someone using AI is.',
  points: [],
  ctaTTS: 'Save this reality check.',
};

const MOCK_HIDDEN_FEATURE_SCRIPT = {
  id: 'test-hidden-feature',
  pillar: 'Hidden Feature',
  topic: 'Claude Projects — Your Secret Weapon',
  hookHeadline: 'The Claude feature nobody talks about',
  hookTTS: 'Claude has a hidden feature most people miss. Projects change everything.',
  points: [
    { toolName: 'Claude', verdict: 'Projects are powerful', tts: 'Claude Projects let you upload context.' },
  ],
  ctaTTS: 'Save this hack.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Instagram Caption Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('generateInstagramCaption', () => {
  test('returns caption with pillar emoji', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.startsWith('⚙️'), 'Workflow pillar should use ⚙️ emoji');
  });

  test('returns caption with correct emoji for each pillar', () => {
    const emojiMap = {
      'Workflow': '⚙️',
      'Comparison': '⚖️',
      'Hidden Feature': '🔍',
      'Time/Money Math': '💰',
      'Myth Bust': '💥',
    };
    for (const [pillar, emoji] of Object.entries(emojiMap)) {
      const script = { ...MOCK_SINGLE_TOOL_SCRIPT, pillar };
      const caption = generateInstagramCaption(script);
      assert.ok(caption.startsWith(emoji), `${pillar} should use ${emoji} emoji`);
    }
  });

  test('includes topic in caption', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes(MOCK_SINGLE_TOOL_SCRIPT.topic), 'Caption should include topic');
  });

  test('includes tool chain line when tools present', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('Perplexity'), 'Caption should include tool names');
  });

  test('includes tool chain with arrow for multiple tools', () => {
    const caption = generateInstagramCaption(MOCK_COMPARISON_SCRIPT);
    assert.ok(caption.includes('→'), 'Caption with multiple tools should include arrow');
  });

  test('includes CTA with @toolsforbuilders', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('Save this'), 'Caption should include Save CTA');
    assert.ok(caption.includes('@toolsforbuilders'), 'Caption should include brand handle');
  });

  test('has correct hashtag count (3-12)', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    const hashtags = caption.match(/#\w+/g) || [];
    assert.ok(hashtags.length >= 3, `Hashtag count should be ≥3, got ${hashtags.length}`);
    assert.ok(hashtags.length <= 12, `Hashtag count should be ≤12, got ${hashtags.length}`);
  });

  test('includes pillar tag', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('#aiworkflow'), 'Workflow pillar should include #aiworkflow');
  });

  test('includes brand tag', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes(BRAND_TAG), 'Caption should include brand tag');
  });

  test('includes tool-specific tag when tool is present', () => {
    const caption = generateInstagramCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('#perplexityai'), 'Caption should include Perplexity-specific tag');
  });

  test('handles null script gracefully', () => {
    const caption = generateInstagramCaption(null);
    assert.ok(caption.includes('Daily AI Workflow'), 'Null script should return fallback caption');
    assert.ok(caption.includes(BRAND_TAG), 'Fallback caption should include brand tag');
  });

  test('handles undefined script gracefully', () => {
    const caption = generateInstagramCaption(undefined);
    assert.ok(caption.length > 0, 'Should return a valid caption');
  });

  test('handles script with no tools', () => {
    const caption = generateInstagramCaption(MOCK_NO_TOOLS_SCRIPT);
    assert.ok(!caption.includes('→'), 'Caption without tools should not have arrow');
    assert.ok(caption.includes('#aidebunked'), 'Myth Bust pillar should include #aidebunked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YouTube Content Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('generateYouTubeContent', () => {
  test('returns object with title, description, backendTags', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.title, 'Should have title');
    assert.ok(content.description, 'Should have description');
    assert.ok(Array.isArray(content.backendTags), 'backendTags should be an array');
  });

  test('title includes #Shorts', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.title.includes('#Shorts'), 'Title should include #Shorts');
  });

  test('title is ≤100 characters', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.title.length <= 100, `Title should be ≤100 chars, got ${content.title.length}`);
  });

  test('title includes tool name when present (single tool)', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.title.includes('Perplexity'), 'Title should include tool name');
  });

  test('title shows vs format for comparison (2 tools)', () => {
    const content = generateYouTubeContent(MOCK_COMPARISON_SCRIPT);
    assert.ok(content.title.includes('vs'), 'Comparison title should include "vs"');
  });

  test('title is still valid for script with no tools', () => {
    const content = generateYouTubeContent(MOCK_NO_TOOLS_SCRIPT);
    assert.ok(content.title.length > 0, 'Title should be present');
    assert.ok(content.title.includes('#Shorts'), 'Title should include #Shorts');
  });

  test('description has keyword-rich paragraph (not just topic line)', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    // Description should have at least 2 sentences and keywords
    assert.ok(content.description.length > 100, 'Description should be substantial');
    assert.ok(content.description.includes('Learn'), 'Description should include action words');
  });

  test('description includes Subscribe CTA', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.description.includes('Subscribe'), 'Description should include Subscribe CTA');
  });

  test('description includes @toolsforbuilders', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.description.includes('@toolsforbuilders'), 'Description should include brand handle');
  });

  test('description has 3-5 hashtags', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    const hashtags = content.description.match(/#\w+/g) || [];
    assert.ok(hashtags.length >= 3, `YouTube description should have ≥3 hashtags, got ${hashtags.length}`);
    assert.ok(hashtags.length <= 5, `YouTube description should have ≤5 hashtags, got ${hashtags.length}`);
  });

  test('first hashtag in description is tool-specific when tool present', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    const hashtags = content.description.match(/#\w+/g) || [];
    // First hashtag should be tool-specific (#perplexityai)
    assert.ok(hashtags[0] === '#perplexityai', `First hashtag should be tool-specific, got ${hashtags[0]}`);
  });

  test('backendTags is an array of strings', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.backendTags.every(t => typeof t === 'string'), 'All backendTags should be strings');
  });

  test('backendTags includes pillar and tool names', () => {
    const content = generateYouTubeContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.backendTags.includes('Workflow'), 'backendTags should include pillar');
    assert.ok(content.backendTags.includes('Perplexity'), 'backendTags should include tool name');
  });

  test('handles null script gracefully', () => {
    const content = generateYouTubeContent(null);
    assert.ok(content.title.includes('#Shorts'), 'Fallback title should include #Shorts');
    assert.ok(content.description.includes('Subscribe'), 'Fallback description should include Subscribe');
    assert.ok(Array.isArray(content.backendTags), 'backendTags should be array even for null script');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TikTok Caption Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('generateTikTokCaption', () => {
  test('first line equals first sentence of hookTTS', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    const expectedFirstLine = 'Stop searching manually';
    assert.ok(caption.startsWith(expectedFirstLine), `First line should be hook, got: ${caption.split('\n')[0]}`);
  });

  test('includes Tools: line when tools present', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('Tools:'), 'TikTok caption should include Tools: line');
  });

  test('Tools line has arrow format for multiple tools', () => {
    const caption = generateTikTokCaption(MOCK_COMPARISON_SCRIPT);
    assert.ok(caption.includes('Tools:'), 'Should have Tools: line');
    assert.ok(caption.includes('→'), 'Multiple tools should use arrow');
  });

  test('includes Follow CTA', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('Follow'), 'TikTok caption should include Follow CTA');
    assert.ok(caption.includes('@toolsforbuilders'), 'TikTok caption should include brand handle');
  });

  test('includes Save this 👇 CTA', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('Save this 👇'), 'TikTok caption should include Save this 👇 CTA');
  });

  test('includes #LearnOnTikTok', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('#LearnOnTikTok'), 'TikTok caption should include #LearnOnTikTok');
  });

  test('includes #TikTokTips', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('#TikTokTips'), 'TikTok caption should include #TikTokTips');
  });

  test('hashtag count is ≤5', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    const hashtags = caption.match(/#\w+/g) || [];
    assert.ok(hashtags.length <= 5, `TikTok hashtag count should be ≤5, got ${hashtags.length}`);
  });

  test('does NOT include Instagram-specific tier2 tags', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    // These are IG-specific mid-tier tags that should NOT appear on TikTok
    const igOnlyTags = ['#workflowautomation', '#digitalnomadlife', '#buildingpublicly', 
                        '#onlinebusiness', '#creatoreconomy', '#growthhacking',
                        '#sidehustle', '#passiveincome', '#entrepreneurmindset',
                        '#contentcreator'];
    for (const tag of igOnlyTags) {
      assert.ok(!caption.includes(tag), `TikTok should NOT include IG tag ${tag}`);
    }
  });

  test('includes pillar tag', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes('#aiworkflow'), 'TikTok should include pillar tag');
  });

  test('includes brand tag', () => {
    const caption = generateTikTokCaption(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(caption.includes(BRAND_TAG), 'TikTok should include brand tag');
  });

  test('handles null script gracefully', () => {
    const caption = generateTikTokCaption(null);
    assert.ok(caption.length > 0, 'Should return a valid caption');
    assert.ok(caption.includes('@toolsforbuilders'), 'Fallback should include brand handle');
  });

  test('handles script with no tools', () => {
    const caption = generateTikTokCaption(MOCK_NO_TOOLS_SCRIPT);
    assert.ok(!caption.includes('Tools:'), 'Caption without tools should not have Tools: line');
    assert.ok(caption.includes('#LearnOnTikTok'), 'Should still include TikTok core tags');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generatePlatformContent Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('generatePlatformContent', () => {
  test('returns all 3 platforms', () => {
    const content = generatePlatformContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(content.instagram, 'Should have instagram');
    assert.ok(content.youtube, 'Should have youtube');
    assert.ok(content.tiktok, 'Should have tiktok');
  });

  test('instagram has caption field', () => {
    const content = generatePlatformContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(typeof content.instagram.caption === 'string', 'instagram.caption should be a string');
    assert.ok(content.instagram.caption.length > 0, 'instagram.caption should not be empty');
  });

  test('youtube has title, description, backendTags', () => {
    const content = generatePlatformContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(typeof content.youtube.title === 'string', 'youtube.title should be a string');
    assert.ok(typeof content.youtube.description === 'string', 'youtube.description should be a string');
    assert.ok(Array.isArray(content.youtube.backendTags), 'youtube.backendTags should be an array');
  });

  test('tiktok has caption field', () => {
    const content = generatePlatformContent(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(typeof content.tiktok.caption === 'string', 'tiktok.caption should be a string');
    assert.ok(content.tiktok.caption.length > 0, 'tiktok.caption should not be empty');
  });

  test('handles null script for all platforms', () => {
    const content = generatePlatformContent(null);
    assert.ok(content.instagram.caption.length > 0, 'Fallback instagram caption should exist');
    assert.ok(content.youtube.title.length > 0, 'Fallback youtube title should exist');
    assert.ok(content.tiktok.caption.length > 0, 'Fallback tiktok caption should exist');
  });

  test('handles undefined script for all platforms', () => {
    const content = generatePlatformContent(undefined);
    assert.ok(content.instagram.caption.length > 0, 'Should handle undefined');
    assert.ok(content.youtube.title.length > 0, 'Should handle undefined');
    assert.ok(content.tiktok.caption.length > 0, 'Should handle undefined');
  });

  test('handles comparison script (2 tools)', () => {
    const content = generatePlatformContent(MOCK_COMPARISON_SCRIPT);
    assert.ok(content.instagram.caption.includes('→'), 'IG should show tool chain');
    assert.ok(content.youtube.title.includes('vs'), 'YouTube should show vs format');
    assert.ok(content.tiktok.caption.includes('→'), 'TikTok should show tool chain');
  });

  test('handles script with no tools', () => {
    const content = generatePlatformContent(MOCK_NO_TOOLS_SCRIPT);
    // All platforms should still generate valid content
    assert.ok(content.instagram.caption.length > 50, 'IG caption should be substantial');
    assert.ok(content.youtube.title.includes('#Shorts'), 'YouTube title should have #Shorts');
    assert.ok(content.tiktok.caption.includes('#LearnOnTikTok'), 'TikTok should have core tags');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildTags (Legacy Compatibility) Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildTags (legacy)', () => {
  test('returns array of hashtags', () => {
    const tags = buildTags(MOCK_SINGLE_TOOL_SCRIPT);
    assert.ok(Array.isArray(tags), 'Should return array');
    assert.ok(tags.every(t => t.startsWith('#')), 'All tags should start with #');
  });

  test('respects max parameter', () => {
    const tags = buildTags(MOCK_SINGLE_TOOL_SCRIPT, 5);
    assert.ok(tags.length <= 5, `Should respect max=5, got ${tags.length}`);
  });

  test('handles null script', () => {
    const tags = buildTags(null);
    assert.ok(Array.isArray(tags), 'Should return array for null script');
    assert.ok(tags.length > 0, 'Should have fallback tags');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export Maps Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Exported constants', () => {
  test('TOOL_TAGS has expected tools', () => {
    assert.ok(TOOL_TAGS['perplexity'], 'Should have perplexity');
    assert.ok(TOOL_TAGS['claude'], 'Should have claude');
    assert.ok(TOOL_TAGS['chatgpt'], 'Should have chatgpt');
  });

  test('PILLAR_TAGS has all 5 pillars', () => {
    const pillars = ['Workflow', 'Comparison', 'Hidden Feature', 'Time/Money Math', 'Myth Bust'];
    for (const pillar of pillars) {
      assert.ok(PILLAR_TAGS[pillar], `Should have ${pillar} pillar`);
    }
  });

  test('TIER_1_TAGS has at least 3 tags', () => {
    assert.ok(TIER_1_TAGS.length >= 3, 'TIER_1_TAGS should have at least 3 tags');
  });

  test('TIER_2_BY_PILLAR has all pillars plus default', () => {
    assert.ok(TIER_2_BY_PILLAR['Workflow'], 'Should have Workflow tier2');
    assert.ok(TIER_2_BY_PILLAR['default'], 'Should have default tier2');
  });

  test('TIKTOK_CORE_TAGS has LearnOnTikTok and TikTokTips', () => {
    assert.ok(TIKTOK_CORE_TAGS.includes('#LearnOnTikTok'), 'Should have #LearnOnTikTok');
    assert.ok(TIKTOK_CORE_TAGS.includes('#TikTokTips'), 'Should have #TikTokTips');
  });

  test('BRAND_TAG is correct', () => {
    assert.strictEqual(BRAND_TAG, '#toolsforbuilders', 'Brand tag should be #toolsforbuilders');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export for preflight check
// ─────────────────────────────────────────────────────────────────────────────

export async function runCaptionFrameworkCheck() {
  const failures = [];

  try {
    // Test basic functionality
    const content = generatePlatformContent(MOCK_SINGLE_TOOL_SCRIPT);
    
    if (!content.instagram?.caption) failures.push('Instagram caption missing');
    if (!content.youtube?.title) failures.push('YouTube title missing');
    if (!content.youtube?.description) failures.push('YouTube description missing');
    if (!content.tiktok?.caption) failures.push('TikTok caption missing');
    
    // Test TikTok doesn't have IG tags
    if (content.tiktok.caption.includes('#workflowautomation')) {
      failures.push('TikTok has IG-specific tag');
    }
    
    // Test TikTok has required tags
    if (!content.tiktok.caption.includes('#LearnOnTikTok')) {
      failures.push('TikTok missing #LearnOnTikTok');
    }
    
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
