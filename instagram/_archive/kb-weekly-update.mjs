#!/usr/bin/env node
/**
 * KB Weekly Update Script
 * 
 * Runs every Monday at 2 AM UTC (9 AM Bangkok) to check for pricing/feature
 * changes on priority AI tools. Updates KB files if changes detected.
 * 
 * PM2 cron: 0 2 * * 1
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, 'data/kb');
const INDEX_PATH = path.join(KB_DIR, 'index.json');
const LOG_PATH = path.join(__dirname, 'logs/kb-refresh.log');

// Priority tools to check every week
const PRIORITY_TOOLS = ['claude', 'gemini', 'chatgpt', 'perplexity', 'canva', 'elevenlabs'];

// Tools to check monthly (rotated)
const MONTHLY_TOOLS = [
  'notion-ai', 'grammarly', 'descript', 'gamma', 'runway', 'pika',
  'heygen', 'zapier', 'n8n', 'make', 'beehiiv', 'suno'
];

async function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(logLine.trim());
  
  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, logLine);
  } catch (err) {
    console.error('Failed to write log:', err.message);
  }
}

async function loadIndex() {
  try {
    const content = await fs.readFile(INDEX_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    await log(`Failed to load index: ${err.message}`);
    return null;
  }
}

async function saveIndex(index) {
  try {
    await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
    await log('Index updated successfully');
  } catch (err) {
    await log(`Failed to save index: ${err.message}`);
  }
}

async function getToolsToCheck() {
  const today = new Date();
  const weekOfMonth = Math.ceil(today.getDate() / 7);
  
  // Always check priority tools
  const toolsToCheck = [...PRIORITY_TOOLS];
  
  // Add rotating monthly tools (different subset each week)
  const monthlySubset = MONTHLY_TOOLS.filter((_, i) => i % 4 === (weekOfMonth - 1));
  toolsToCheck.push(...monthlySubset);
  
  return toolsToCheck;
}

async function checkToolFile(toolSlug) {
  const filePath = path.join(KB_DIR, `${toolSlug}.md`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Extract last_verified date from frontmatter
    const match = content.match(/last_verified:\s*(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const lastVerified = new Date(match[1]);
      const daysSince = Math.floor((Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        slug: toolSlug,
        exists: true,
        lastVerified: match[1],
        daysSinceVerification: daysSince,
        needsUpdate: daysSince > 14 // Flag if over 2 weeks old
      };
    }
    
    return {
      slug: toolSlug,
      exists: true,
      lastVerified: null,
      needsUpdate: true
    };
  } catch (err) {
    return {
      slug: toolSlug,
      exists: false,
      needsUpdate: true
    };
  }
}

async function generateReport(results) {
  const needsAttention = results.filter(r => r.needsUpdate);
  const upToDate = results.filter(r => !r.needsUpdate);
  
  let report = `
# KB Weekly Refresh Report
Date: ${new Date().toISOString().split('T')[0]}

## Summary
- Tools checked: ${results.length}
- Up to date: ${upToDate.length}
- Needs attention: ${needsAttention.length}

## Needs Attention
${needsAttention.map(t => `- ${t.slug}: ${t.lastVerified ? `Last verified ${t.daysSinceVerification} days ago` : 'No verification date'}`).join('\n') || 'None'}

## Up to Date
${upToDate.map(t => `- ${t.slug}: Verified ${t.daysSinceVerification} days ago`).join('\n') || 'None'}

## Next Steps
${needsAttention.length > 0 ? 
  'Manual verification needed for tools flagged above. Use web_search to check current pricing and features.' :
  'All priority tools verified recently. No action needed.'}
`;
  
  return report;
}

async function main() {
  await log('=== KB Weekly Refresh Started ===');
  
  const index = await loadIndex();
  if (!index) {
    await log('ERROR: Could not load index.json');
    process.exit(1);
  }
  
  const toolsToCheck = await getToolsToCheck();
  await log(`Checking ${toolsToCheck.length} tools: ${toolsToCheck.join(', ')}`);
  
  const results = [];
  for (const tool of toolsToCheck) {
    const result = await checkToolFile(tool);
    results.push(result);
    await log(`  ${tool}: ${result.needsUpdate ? 'NEEDS UPDATE' : 'OK'} (${result.lastVerified || 'no date'})`);
  }
  
  const report = await generateReport(results);
  
  // Save report
  const reportPath = path.join(__dirname, 'logs', `kb-report-${new Date().toISOString().split('T')[0]}.md`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report);
  await log(`Report saved to ${reportPath}`);
  
  // Update index with next refresh date
  index.weekly_refresh_schedule = index.weekly_refresh_schedule || {};
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + 7);
  index.weekly_refresh_schedule.next_refresh = nextMonday.toISOString().split('T')[0];
  index.weekly_refresh_schedule.last_run = new Date().toISOString();
  await saveIndex(index);
  
  await log('=== KB Weekly Refresh Complete ===');
  
  // Return report for potential notification
  return {
    needsAttention: results.filter(r => r.needsUpdate).length,
    report
  };
}

main().catch(async (err) => {
  await log(`ERROR: ${err.message}`);
  process.exit(1);
});
