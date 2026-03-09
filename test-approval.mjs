#!/usr/bin/env node
/**
 * Test script for approval flow.
 * Simulates approval request without actually sending Telegram messages.
 * Sets environment variable DRY_RUN=1 to skip real API calls.
 */

import { requestApproval } from './approval.mjs';

async function test() {
  console.log('🧪 Testing approval flow (dry-run)...');
  // Temporarily override fetch to mock
  const originalFetch = global.fetch;
  let intercepted = false;
  global.fetch = async (url, options) => {
    intercepted = true;
    console.log(`📡 Mock fetch: ${url}`);
    if (url.includes('/sendMessage')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 12345, chat: { id: -1003879867373 } }
        })
      };
    }
    if (url.includes('/getUpdates')) {
      // Simulate no updates (timeout)
      return {
        ok: true,
        json: async () => ({ ok: true, result: [] })
      };
    }
    return { ok: false, json: async () => ({ description: 'Mock error' }) };
  };
  
  try {
    const approved = await requestApproval('https://example.com/test.mp4', 'Test caption');
    console.log('✅ Approval result:', approved ? 'APPROVED' : 'NOT APPROVED');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    global.fetch = originalFetch;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  test();
}