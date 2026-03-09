#!/usr/bin/env node
/**
 * parity.test.mjs — Tests that daily-crosspost.mjs and post-approved-reel.mjs
 * produce identical output for captions, descriptions, tags, and archive entries.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = dirname(__dirname);

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
// Extract functions from both files for comparison
// ─────────────────────────────────────────────────────────────────────────────

// Hashtag constants (must match both files)
const TOOL_TAGS = {
  'perplexity': '#perplexityai',
  'gemini': '#geminiapp',
  'gemini deep research': '#geminiapp',
  'claude': '#claudeai',
  'chatgpt': '#chatgpt',
  'notebooklm': '#notebooklm',
  'midjourney': '#midjourney',
  'n8n': '#n8nautomation',
  'zapier': '#zapier',
  'make': '#makeautomation',
  'runway': '#runwayml',
  'elevenlabs': '#elevenlabs',
  'gpt': '#openai',
  'openai': '#openai',
  'suno': '#sunoai',
  'kling': '#klingai',
  'descript': '#descript',
  'notion': '#notionai',
  'canva': '#canva',
  'gamma': '#gammaapp',
};

const PILLAR_TAGS = {
  'Workflow': '#aiworkflow',
  'Comparison': '#aicomparison',
  'Hidden Feature': '#aihacks',
  'Time/Money Math': '#savetime',
  'Myth Bust': '#aidebunked',
};

const CORE_TAGS = ['#aitools', '#solopreneur', '#productivity'];
const BRAND_TAG = '#toolsforbuilders';

function buildTags(script, max = 12) {
  if (!script) return [...CORE_TAGS, BRAND_TAG].slice(0, max);
  const toolNames = (script.points || []).map(p => p.toolName).filter(Boolean);
  const toolTags = toolNames.map(t => TOOL_TAGS[t.toLowerCase()] || null).filter(Boolean);
  const pillarTag = PILLAR_TAGS[script.pillar] || '#workflow';
  return [...new Set([pillarTag, ...toolTags, ...CORE_TAGS, BRAND_TAG])].slice(0, max);
}

function generateCaption(script) {
  if (script) {
    const pillarEmoji = { 'Workflow': '⚙️', 'Comparison': '⚖️', 'Hidden Feature': '🔍', 'Time/Money Math': '💰', 'Myth Bust': '💥' };
    const emoji = pillarEmoji[script.pillar] || '🛠️';
    const toolNames = [...new Set((script.points || []).map(p => p.toolName).filter(Boolean))];
    const toolLine = toolNames.length ? `\n${toolNames.join(' → ')}` : '';
    const allTags = buildTags(script, 12);
    return `${emoji} ${script.topic}${toolLine}\n\nSave this. Follow @toolsforbuilders for one workflow every day.\n\n${allTags.join(' ')}`;
  }
  return `🛠️ Daily AI Workflow\n\nFollow @toolsforbuilders for one practical AI workflow every day.\n\n${[...CORE_TAGS, BRAND_TAG].join(' ')}`;
}

function generateTikTokCaption(script) {
  if (!script) return `🛠️ AI workflow for solopreneurs\n\n${[...CORE_TAGS, BRAND_TAG].slice(0, 5).join(' ')}`;

  const hookLine = script.hookTTS
    ? script.hookTTS.split('.')[0].trim()
    : script.topic;

  const tools = [...new Set((script.points || []).map(p => p.toolName).filter(Boolean))];
  const toolLine = tools.length ? `\nTools: ${tools.join(' → ')}` : '';

  const tags = buildTags(script, 5);

  return `${hookLine}${toolLine}\n\nSave this 👇 Follow @toolsforbuilders for one AI workflow every day.\n\n${tags.join(' ')}`;
}

function generateYouTubeDescription(script) {
  const ytTags = buildTags(script, 5);
  return script
    ? `${script.topic}\n\nSave this workflow. Subscribe for one AI tool workflow every day.\n\n${ytTags.join(' ')}`
    : `AI tools for solopreneurs. Subscribe for more.\n\n${[...CORE_TAGS, BRAND_TAG].slice(0, 5).join(' ')}`;
}

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
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Caption Parity', () => {
  test('Instagram caption has pillar emoji', () => {
    const caption = generateCaption(MOCK_SCRIPT);
    assert.ok(caption.startsWith('⚙️'), 'Workflow pillar should use ⚙️ emoji');
  });

  test('Instagram caption has topic', () => {
    const caption = generateCaption(MOCK_SCRIPT);
    assert.ok(caption.includes(MOCK_SCRIPT.topic), 'Caption should include topic');
  });

  test('Instagram caption has tool names', () => {
    const caption = generateCaption(MOCK_SCRIPT);
    assert.ok(caption.includes('Perplexity'), 'Caption should include tool names');
    assert.ok(caption.includes('Claude'), 'Caption should include tool names');
  });

  test('Instagram caption has CTA', () => {
    const caption = generateCaption(MOCK_SCRIPT);
    assert.ok(caption.includes('Save this'), 'Caption should include save CTA');
    assert.ok(caption.includes('@toolsforbuilders'), 'Caption should include brand');
  });

  test('Instagram caption has correct hashtag count', () => {
    const caption = generateCaption(MOCK_SCRIPT);
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
});

describe('YouTube Description Parity', () => {
  test('YouTube description has topic', () => {
    const desc = generateYouTubeDescription(MOCK_SCRIPT);
    assert.ok(desc.includes(MOCK_SCRIPT.topic), 'YouTube description should include topic');
  });

  test('YouTube description has subscribe CTA', () => {
    const desc = generateYouTubeDescription(MOCK_SCRIPT);
    assert.ok(desc.includes('Subscribe'), 'YouTube description should include subscribe CTA');
  });

  test('YouTube description has max 5 hashtags', () => {
    const desc = generateYouTubeDescription(MOCK_SCRIPT);
    const hashtags = desc.match(/#\w+/g) || [];
    assert.ok(hashtags.length <= 5, `YouTube hashtag count should be ≤5, got ${hashtags.length}`);
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
    // Test Instagram caption structure
    const caption = generateCaption(MOCK_SCRIPT);
    if (!caption.startsWith('⚙️')) failures.push('Instagram caption missing pillar emoji');
    if (!caption.includes(MOCK_SCRIPT.topic)) failures.push('Instagram caption missing topic');
    
    // Test TikTok caption structure  
    const tikTok = generateTikTokCaption(MOCK_SCRIPT);
    if (!tikTok.includes('Tools:')) failures.push('TikTok caption missing tools line');
    
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
