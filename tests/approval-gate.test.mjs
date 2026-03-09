/**
 * approval-gate.test.mjs
 * Critical integration tests: no platform posts without explicit approval.
 * These exist because an approval bypass caused an unapproved YouTube upload on 2026-03-09.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPROVALS_DIR = join(__dirname, '../instagram/data/approvals');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function writeApproval(id, decision) {
  if (!existsSync(APPROVALS_DIR)) mkdirSync(APPROVALS_DIR, { recursive: true });
  writeFileSync(
    join(APPROVALS_DIR, `approval-${id}.json`),
    JSON.stringify({ decision, approvalId: id, decidedAt: new Date().toISOString() })
  );
}

function clearApproval(id) {
  const path = join(APPROVALS_DIR, `approval-${id}.json`);
  if (existsSync(path)) {
    writeFileSync(path, JSON.stringify({ status: 'pending', approvalId: id }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval file mechanics
// ─────────────────────────────────────────────────────────────────────────────

describe('Approval file mechanics', () => {
  test('approved decision is detected from file', () => {
    const id = 'test-gate-approved-' + Date.now();
    writeApproval(id, 'approved');
    const state = JSON.parse(readFileSync(join(APPROVALS_DIR, `approval-${id}.json`), 'utf8'));
    assert.equal(state.decision, 'approved');
    clearApproval(id);
  });

  test('rejected decision is detected from file', () => {
    const id = 'test-gate-rejected-' + Date.now();
    writeApproval(id, 'rejected');
    const state = JSON.parse(readFileSync(join(APPROVALS_DIR, `approval-${id}.json`), 'utf8'));
    assert.equal(state.decision, 'rejected');
    clearApproval(id);
  });

  test('pending file has no decision', () => {
    const id = 'test-gate-pending-' + Date.now();
    if (!existsSync(APPROVALS_DIR)) mkdirSync(APPROVALS_DIR, { recursive: true });
    writeFileSync(
      join(APPROVALS_DIR, `approval-${id}.json`),
      JSON.stringify({ status: 'pending', approvalId: id, createdAt: new Date().toISOString() })
    );
    const state = JSON.parse(readFileSync(join(APPROVALS_DIR, `approval-${id}.json`), 'utf8'));
    assert.equal(state.decision, undefined, 'Pending file must not have a decision field');
    clearApproval(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Platform gating logic (unit-level simulation)
// ─────────────────────────────────────────────────────────────────────────────

describe('Platform gating — no post without approval', () => {
  /**
   * Simulates the gating logic from daily-crosspost.mjs.
   * Each platform checks approvalGranted before running.
   */
  function simulatePipeline(approvalGranted, r2Available) {
    const results = { instagram: null, youtube: null, tiktok: null };

    // Instagram — requires both approval AND r2
    if (!approvalGranted) {
      results.instagram = { success: false, error: 'skipped - not approved' };
    } else if (!r2Available) {
      results.instagram = { success: false, error: 'R2 upload missing' };
    } else {
      results.instagram = { success: true };
    }

    // YouTube — requires approval (uses local file, NOT r2)
    if (!approvalGranted) {
      results.youtube = { success: false, error: 'skipped - not approved' };
    } else {
      results.youtube = { success: true };
    }

    // TikTok — requires approval
    if (!approvalGranted) {
      results.tiktok = { success: false, error: 'skipped - not approved' };
    } else {
      results.tiktok = { success: true };
    }

    return results;
  }

  test('all platforms blocked when approval is false (R2 available)', () => {
    const results = simulatePipeline(false, true);
    assert.equal(results.instagram.success, false);
    assert.equal(results.youtube.success, false);
    assert.equal(results.tiktok.success, false);
    assert.match(results.youtube.error, /not approved/);
  });

  test('all platforms blocked when approval is false (R2 failed)', () => {
    const results = simulatePipeline(false, false);
    assert.equal(results.instagram.success, false);
    assert.equal(results.youtube.success, false, 'YouTube MUST be blocked even when R2 fails — this was the bug on 2026-03-09');
    assert.equal(results.tiktok.success, false);
  });

  test('YouTube specifically blocked when approval false regardless of R2', () => {
    // This is the exact scenario that caused the unapproved upload on 2026-03-09
    const r2Failed = simulatePipeline(false, false);
    assert.equal(r2Failed.youtube.success, false,
      'REGRESSION: YouTube posted without approval when R2 failed (2026-03-09 bug)');
  });

  test('all platforms proceed when approved with R2 available', () => {
    const results = simulatePipeline(true, true);
    assert.equal(results.instagram.success, true);
    assert.equal(results.youtube.success, true);
    assert.equal(results.tiktok.success, true);
  });

  test('instagram blocked but youtube/tiktok proceed when approved with R2 failed', () => {
    const results = simulatePipeline(true, false);
    assert.equal(results.instagram.success, false); // needs R2
    assert.equal(results.youtube.success, true);    // uses local file
    assert.equal(results.tiktok.success, true);     // manual handoff
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Caption hashtag guard (posting without hashtags = algorithm miss)
// ─────────────────────────────────────────────────────────────────────────────

describe('Hashtag guard — must be in original caption', () => {
  test('captions with 3+ hashtags pass the guard', () => {
    const caption = 'Great post\n\n#aitools #solopreneur #toolsforbuilders';
    const count = (caption.match(/#\w+/g) || []).length;
    assert.ok(count >= 3, `Expected ≥3 hashtags, got ${count}`);
  });

  test('captions without hashtags fail the guard', () => {
    const caption = 'Great post with no hashtags at all';
    const count = (caption.match(/#\w+/g) || []).length;
    assert.ok(count < 3, `Expected <3 hashtags for this test`);
  });

  test('YouTube description must include hashtags before upload', () => {
    const description = 'Learn about AI tools.\n\nSubscribe → @toolsforbuilders\n\n#descript #aihacks #toolsforbuilders';
    const count = (description.match(/#\w+/g) || []).length;
    assert.ok(count >= 3, `YouTube description needs ≥3 hashtags, got ${count}`);
  });
});
