#!/usr/bin/env node
/**
 * run-scan-now.mjs - One-shot manual trigger for X intelligence scan
 * 
 * Usage: node run-scan-now.mjs
 * 
 * Runs a full morning scan and reports what was submitted to the pipeline.
 */

import { runMorningIntelligence } from './morning-intelligence.mjs';

console.log('🚀 Starting X Intelligence Scan...\n');

runMorningIntelligence()
  .then(drafts => {
    const replyCount = drafts.filter(d => d.type === 'reply').length;
    const threadCount = drafts.filter(d => d.type === 'thread').length;
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Generated ${drafts.length} drafts`);
    console.log(`   - ${replyCount} reply drafts`);
    console.log(`   - ${threadCount} thread drafts`);
    console.log('='.repeat(50));
    console.log('\n📋 Check the Brand tab in your dashboard to review and approve.');
    
    if (drafts.length > 0) {
      console.log('\n📝 Sample content:');
      drafts.slice(0, 2).forEach((draft, i) => {
        console.log(`\n${i + 1}. ${draft.type.toUpperCase()} (ID: ${draft.item.id})`);
        if (draft.type === 'reply') {
          console.log(`   Text: ${draft.item.content_json.text?.slice(0, 100)}...`);
        } else {
          console.log(`   Tweets: ${draft.item.content_json.tweets?.length} in thread`);
          console.log(`   Preview: ${draft.item.content_json.tweets?.[0]?.text?.slice(0, 80)}...`);
        }
        console.log(`   Scheduled: ${draft.item.scheduled_date}`);
        console.log(`   Urgency: ${draft.item.urgency}`);
      });
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Scan failed:', err.message);
    process.exit(1);
  });
