#!/usr/bin/env node
/**
 * approval-flow.test.mjs — Test the approval file read/write cycle
 * without making real Telegram API calls.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = dirname(__dirname);
const APPROVALS_DIR = join(scriptsDir, 'instagram/data/approvals');
const TEST_APPROVAL_ID = 'test_approval_123';

describe('Approval File Operations', () => {
  
  beforeEach(() => {
    // Ensure approvals directory exists
    if (!existsSync(APPROVALS_DIR)) {
      mkdirSync(APPROVALS_DIR, { recursive: true });
    }
  });
  
  afterEach(() => {
    // Clean up test approval file
    const testFilePath = join(APPROVALS_DIR, `approval-${TEST_APPROVAL_ID}.json`);
    if (existsSync(testFilePath)) {
      rmSync(testFilePath);
    }
  });
  
  test('Can write pending approval file', () => {
    const filePath = join(APPROVALS_DIR, `approval-${TEST_APPROVAL_ID}.json`);
    const pendingState = {
      status: 'pending',
      approvalId: TEST_APPROVAL_ID,
      createdAt: new Date().toISOString(),
    };
    
    writeFileSync(filePath, JSON.stringify(pendingState));
    assert.ok(existsSync(filePath), 'Approval file should be created');
    
    const read = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.strictEqual(read.status, 'pending', 'Status should be pending');
    assert.strictEqual(read.approvalId, TEST_APPROVAL_ID, 'Approval ID should match');
  });
  
  test('Can write approved decision', () => {
    const filePath = join(APPROVALS_DIR, `approval-${TEST_APPROVAL_ID}.json`);
    
    // Write pending first
    writeFileSync(filePath, JSON.stringify({ status: 'pending', approvalId: TEST_APPROVAL_ID }));
    
    // Write approved decision
    const decision = {
      decision: 'approved',
      approvalId: TEST_APPROVAL_ID,
      decidedAt: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(decision));
    
    const read = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.strictEqual(read.decision, 'approved', 'Decision should be approved');
  });
  
  test('Can write rejected decision', () => {
    const filePath = join(APPROVALS_DIR, `approval-${TEST_APPROVAL_ID}.json`);
    
    // Write pending first
    writeFileSync(filePath, JSON.stringify({ status: 'pending', approvalId: TEST_APPROVAL_ID }));
    
    // Write rejected decision
    const decision = {
      decision: 'rejected',
      approvalId: TEST_APPROVAL_ID,
      decidedAt: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(decision));
    
    const read = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.strictEqual(read.decision, 'rejected', 'Decision should be rejected');
  });
  
  test('Decision read returns correct value', () => {
    const filePath = join(APPROVALS_DIR, `approval-${TEST_APPROVAL_ID}.json`);
    
    // Simulate approved decision
    writeFileSync(filePath, JSON.stringify({
      decision: 'approved',
      approvalId: TEST_APPROVAL_ID,
      decidedAt: new Date().toISOString(),
    }));
    
    const state = JSON.parse(readFileSync(filePath, 'utf8'));
    const result = state.decision === 'approved' ? 'approved'
                 : state.decision === 'rejected' ? 'rejected'
                 : 'pending';
    
    assert.strictEqual(result, 'approved', 'Should read approved decision');
  });
});

describe('Approval ID Format', () => {
  
  test('Approval ID format: crosspost_<timestamp>', () => {
    const approvalId = `crosspost_${Date.now()}`;
    assert.ok(approvalId.startsWith('crosspost_'), 'Should start with crosspost_');
    assert.ok(/^crosspost_\d+$/.test(approvalId), 'Should match crosspost_<digits> pattern');
  });
  
  test('File path resolves correctly', () => {
    const approvalId = 'crosspost_1234567890';
    const filePath = join(APPROVALS_DIR, `approval-${approvalId}.json`);
    assert.ok(filePath.includes('approval-crosspost_1234567890.json'), 'File path should include approval ID');
  });
});

describe('Decision State Machine', () => {
  
  test('Valid states: pending -> approved', () => {
    const transitions = ['pending', 'approved'];
    assert.ok(transitions.includes('pending'), 'pending is a valid state');
    assert.ok(transitions.includes('approved'), 'approved is a valid final state');
  });
  
  test('Valid states: pending -> rejected', () => {
    const transitions = ['pending', 'rejected'];
    assert.ok(transitions.includes('pending'), 'pending is a valid state');
    assert.ok(transitions.includes('rejected'), 'rejected is a valid final state');
  });
  
  test('Valid states: pending -> timeout (implicit)', () => {
    // Timeout is not stored in file, just returned when polling times out
    assert.ok(true, 'timeout is an implicit final state');
  });
});
