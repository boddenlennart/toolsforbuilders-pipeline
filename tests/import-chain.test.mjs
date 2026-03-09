#!/usr/bin/env node
/**
 * import-chain.test.mjs — Verify all main modules import successfully
 * and export their expected functions.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Import Chain Tests', () => {
  
  test('post-to-instagram.mjs exports postToInstagram', async () => {
    const mod = await import('../instagram/post-to-instagram.mjs');
    assert.strictEqual(typeof mod.postToInstagram, 'function', 'postToInstagram should be a function');
  });
  
  test('upload-to-youtube.mjs exports uploadToYouTube', async () => {
    const mod = await import('../youtube/upload-to-youtube.mjs');
    assert.strictEqual(typeof mod.uploadToYouTube, 'function', 'uploadToYouTube should be a function');
  });
  
  test('upload-to-r2.mjs exports uploadToR2', async () => {
    const mod = await import('../instagram/upload-to-r2.mjs');
    assert.strictEqual(typeof mod.uploadToR2, 'function', 'uploadToR2 should be a function');
  });
  
  test('alert.mjs exports sendAlert', async () => {
    const mod = await import('../alert.mjs');
    assert.strictEqual(typeof mod.sendAlert, 'function', 'sendAlert should be a function');
  });
  
  test('approval.mjs exports requestApproval', async () => {
    const mod = await import('../approval.mjs');
    assert.strictEqual(typeof mod.requestApproval, 'function', 'requestApproval should be a function');
  });
  
  test('quality-gate.mjs exports checkQuality', async () => {
    const mod = await import('../instagram/quality-gate.mjs');
    assert.strictEqual(typeof mod.checkQuality, 'function', 'checkQuality should be a function');
  });
  
  test('post-reel.mjs exports uploadReelToInstagram', async () => {
    const mod = await import('../instagram/post-reel.mjs');
    assert.strictEqual(typeof mod.uploadReelToInstagram, 'function', 'uploadReelToInstagram should be a function');
  });
  
  test('analytics-pull.mjs exports pullAnalytics', async () => {
    const mod = await import('../analytics-pull.mjs');
    assert.strictEqual(typeof mod.pullAnalytics, 'function', 'pullAnalytics should be a function');
  });
  
  test('analytics-pull.mjs exports loadPerformanceLogs', async () => {
    const mod = await import('../analytics-pull.mjs');
    assert.strictEqual(typeof mod.loadPerformanceLogs, 'function', 'loadPerformanceLogs should be a function');
  });
  
  test('analytics-pull.mjs exports checkPostDue', async () => {
    const mod = await import('../analytics-pull.mjs');
    assert.strictEqual(typeof mod.checkPostDue, 'function', 'checkPostDue should be a function');
  });
  
  test('analytics-pull.mjs exports daysSincePost', async () => {
    const mod = await import('../analytics-pull.mjs');
    assert.strictEqual(typeof mod.daysSincePost, 'function', 'daysSincePost should be a function');
  });
});

describe('Module Import Health', () => {
  
  test('All modules import without throwing', async () => {
    const modules = [
      '../instagram/post-to-instagram.mjs',
      '../youtube/upload-to-youtube.mjs',
      '../instagram/upload-to-r2.mjs',
      '../alert.mjs',
      '../approval.mjs',
      '../instagram/quality-gate.mjs',
      '../instagram/post-reel.mjs',
      '../analytics-pull.mjs',
    ];
    
    for (const modulePath of modules) {
      await assert.doesNotReject(
        async () => await import(modulePath),
        `Module ${modulePath} should import without errors`
      );
    }
  });
});
