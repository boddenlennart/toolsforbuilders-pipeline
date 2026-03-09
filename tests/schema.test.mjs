#!/usr/bin/env node
/**
 * schema.test.mjs — JSON schema validation for scripts in the content queue.
 * Validates all required fields, word counts, and content rules.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = dirname(__dirname);
const QUEUE_PATH = join(scriptsDir, 'instagram/data/content-queue.json');

// Required fields for a valid script
const REQUIRED_FIELDS = [
  'id', 'pillar', 'topic', 'hookHeadline', 'hookSub', 'hookTTS',
  'agitateMain', 'agitateBridge', 'agitateTTS',
  'points', 'proofStat', 'proofTTS', 'ctaTTS'
];

// Word count limits
const WORD_LIMITS = {
  hookTTS: 18,
  agitateTTS: 18,
  proofTTS: 20,
  ctaTTS: 13, // Exact match expected
};

const POINT_TTS_LIMIT = 27;
const MIN_POINTS = 2;

// Expected CTA TTS text
const EXPECTED_CTA = "Save this before you forget it. I drop one of these every day.";

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function validateRequiredFields(script) {
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (script[field] === undefined || script[field] === null) {
      missing.push(field);
    }
  }
  return missing;
}

function validateWordCounts(script) {
  const issues = [];
  
  for (const [field, limit] of Object.entries(WORD_LIMITS)) {
    const count = countWords(script[field]);
    if (field === 'ctaTTS') {
      // CTA TTS must be exactly 13 words
      if (count !== limit) {
        issues.push(`${field}: ${count} words (expected exactly ${limit})`);
      }
    } else {
      if (count > limit) {
        issues.push(`${field}: ${count} words (max ${limit})`);
      }
    }
  }
  
  // Check point TTS word counts
  if (Array.isArray(script.points)) {
    for (let i = 0; i < script.points.length; i++) {
      const point = script.points[i];
      const count = countWords(point.tts);
      if (count > POINT_TTS_LIMIT) {
        issues.push(`points[${i}].tts: ${count} words (max ${POINT_TTS_LIMIT})`);
      }
    }
  }
  
  return issues;
}

function validatePointsArray(script) {
  const issues = [];
  
  if (!Array.isArray(script.points)) {
    issues.push('points is not an array');
    return issues;
  }
  
  if (script.points.length < MIN_POINTS) {
    issues.push(`points has ${script.points.length} items (min ${MIN_POINTS})`);
  }
  
  return issues;
}

function validateNoUnverified(script) {
  const issues = [];
  const checkValue = (value, path) => {
    if (typeof value === 'string' && value.includes('UNVERIFIED')) {
      issues.push(`UNVERIFIED found in ${path}`);
    }
  };
  
  const walk = (obj, path = '') => {
    if (typeof obj === 'string') {
      checkValue(obj, path);
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  
  walk(script);
  return issues;
}

function validateCtaTTS(script) {
  if (script.ctaTTS !== EXPECTED_CTA) {
    return [`ctaTTS does not match expected text`];
  }
  return [];
}

function validateClaimsArray(script) {
  // Claims array should be present (can be empty for older scripts)
  if (!Array.isArray(script.claims) && script.claims !== undefined) {
    return ['claims field exists but is not an array'];
  }
  return [];
}

function validateScript(script) {
  const allIssues = {
    required: validateRequiredFields(script),
    wordCounts: validateWordCounts(script),
    points: validatePointsArray(script),
    unverified: validateNoUnverified(script),
    ctaTTS: validateCtaTTS(script),
    claims: validateClaimsArray(script),
  };
  
  const totalIssues = Object.values(allIssues).flat();
  return {
    passed: totalIssues.length === 0,
    issues: allIssues,
    totalIssueCount: totalIssues.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema Validation', () => {
  test('Queue file exists', () => {
    assert.ok(existsSync(QUEUE_PATH), 'content-queue.json should exist');
  });
  
  test('Queue file is valid JSON', () => {
    const content = readFileSync(QUEUE_PATH, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), 'Queue should be valid JSON');
  });
  
  test('Queue has posts array', () => {
    const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
    assert.ok(Array.isArray(queue.posts), 'Queue should have posts array');
  });
});

describe('Script Validation', () => {
  let queue;
  
  try {
    queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  } catch (e) {
    queue = { posts: [] };
  }
  
  // Only test queued/needs-review scripts
  const activeScripts = (queue.posts || []).filter(
    p => p.status === 'queued' || p.status === 'needs-review'
  );
  
  if (activeScripts.length === 0) {
    test('No active scripts to validate', () => {
      assert.ok(true, 'No scripts with status queued or needs-review');
    });
  } else {
    for (const script of activeScripts) {
      describe(`Script: ${script.id}`, () => {
        test('has all required fields', () => {
          const missing = validateRequiredFields(script);
          assert.strictEqual(missing.length, 0, `Missing fields: ${missing.join(', ')}`);
        });
        
        test('word counts within limits', () => {
          const issues = validateWordCounts(script);
          assert.strictEqual(issues.length, 0, issues.join('; '));
        });
        
        test('has at least 2 points', () => {
          const issues = validatePointsArray(script);
          assert.strictEqual(issues.length, 0, issues.join('; '));
        });
        
        test('no UNVERIFIED strings', () => {
          const issues = validateNoUnverified(script);
          assert.strictEqual(issues.length, 0, issues.join('; '));
        });
        
        test('ctaTTS matches expected text', () => {
          const issues = validateCtaTTS(script);
          assert.strictEqual(issues.length, 0, issues.join('; '));
        });
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI: Run validation on all queue scripts
// ─────────────────────────────────────────────────────────────────────────────

export async function runSchemaValidation() {
  if (!existsSync(QUEUE_PATH)) {
    return { passed: false, scripts: [], error: 'Queue file not found' };
  }
  
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  const results = [];

  // Only validate active scripts — posted/used scripts are historical and may predate current limits
  const activeStatuses = new Set(['queued', 'needs-review']);
  const activeScripts = (queue.posts || []).filter(p => activeStatuses.has(p.status));

  for (const script of activeScripts) {
    const validation = validateScript(script);
    results.push({
      id: script.id,
      status: script.status,
      ...validation,
    });
  }
  
  const failures = results.filter(r => !r.passed);
  return {
    passed: failures.length === 0,
    total: results.length,
    failures: failures.length,
    scripts: results,
  };
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSchemaValidation().then(result => {
    console.log('═'.repeat(60));
    console.log('📋 Schema Validation Report');
    console.log('═'.repeat(60));
    console.log(`Total scripts: ${result.total}`);
    console.log(`Passed: ${result.total - result.failures}`);
    console.log(`Failed: ${result.failures}`);
    console.log('');
    
    if (result.failures > 0) {
      console.log('❌ FAILURES:');
      for (const script of result.scripts.filter(s => !s.passed)) {
        console.log(`\n  📄 ${script.id} (status: ${script.status})`);
        for (const [category, issues] of Object.entries(script.issues)) {
          if (issues.length > 0) {
            console.log(`     ${category}: ${issues.join(', ')}`);
          }
        }
      }
    } else {
      console.log('✅ All scripts pass schema validation');
    }
    
    process.exit(result.passed ? 0 : 1);
  });
}
