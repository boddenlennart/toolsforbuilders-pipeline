#!/usr/bin/env node
// review-tiers.mjs — Weekly tier review for @btcmaxistheway's engagement strategy
// Compares current following list against target-accounts.md
// Outputs recommendations for Lennart to approve

import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';

const USER_ID = '1821605462846140418';
const WORKSPACE = '/root/.openclaw/workspace';
const SECRETS_PATH = path.join(WORKSPACE, '.env.secrets');
const TARGET_ACCOUNTS_PATH = path.join(WORKSPACE, 'scripts/twitter/target-accounts.md');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const HEARTBEAT_STATE_PATH = path.join(MEMORY_DIR, 'heartbeat-state.json');

// Tier boundaries (follower counts)
const TIER_BOUNDARIES = {
  tier1: 400000,  // 400K+
  tier2: 50000,   // 50K-400K
  tier3: 10000,   // 10K-50K
  excluded: 0     // <10K or off-brand
};

function loadSecrets(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return result;
}

function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, baseUrl, queryParams, ck, cs, tk, ts) {
  const op = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tk,
    oauth_version: '1.0',
  };
  const all = { ...op, ...queryParams };
  const sorted = Object.entries(all).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
  const base = [method.toUpperCase(), encode(baseUrl), encode(sorted)].join('&');
  const key = `${encode(cs)}&${encode(ts)}`;
  op.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.entries(op).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}="${encode(v)}"`).join(', ');
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllFollowing(ck, cs, tk, ts) {
  const allUsers = [];
  let paginationToken = null;
  
  do {
    const baseUrl = `https://api.x.com/2/users/${USER_ID}/following`;
    const queryParams = {
      max_results: '100',
      'user.fields': 'username,name,description,public_metrics',
    };
    if (paginationToken) {
      queryParams.pagination_token = paginationToken;
    }
    
    const authHeader = oauthSign('GET', baseUrl, queryParams, ck, cs, tk, ts);
    const qs = Object.entries(queryParams).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    
    const result = await httpsGet(`${baseUrl}?${qs}`, { Authorization: authHeader });
    
    if (result.status !== 200) {
      console.error('❌ API Error:', JSON.stringify(result.body, null, 2));
      process.exit(1);
    }
    
    if (result.body.data) {
      allUsers.push(...result.body.data);
    }
    
    paginationToken = result.body.meta?.next_token || null;
    
    // Rate limit protection
    if (paginationToken) {
      await new Promise(r => setTimeout(r, 1000));
    }
  } while (paginationToken);
  
  return allUsers;
}

function parseTargetAccounts(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const accounts = {};
  
  // Stop parsing at "Accounts to Consider Following" section - those aren't actual follows
  const cutoffIdx = content.indexOf('## Accounts to Consider Following');
  const parseContent = cutoffIdx > 0 ? content.slice(0, cutoffIdx) : content;
  
  // Parse all table rows containing @handle
  const lines = parseContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match lines starting with | @handle |
    const handleMatch = line.match(/^\|\s*@(\w+)\s*\|/);
    if (!handleMatch) continue;
    
    const handle = handleMatch[1].toLowerCase();
    
    // Extract all numbers that look like follower counts from the line
    const cells = line.split('|').map(c => c.trim());
    let followers = 0;
    
    for (const cell of cells) {
      // Look for follower count patterns: 4.9M, 888K, 50000, etc.
      const numMatch = cell.match(/^([\d.,]+)\s*([KkMm])?$/);
      if (numMatch) {
        let num = parseFloat(numMatch[1].replace(/,/g, ''));
        const suffix = numMatch[2]?.toUpperCase();
        if (suffix === 'M') num *= 1000000;
        else if (suffix === 'K') num *= 1000;
        if (num >= 100) { // Assume follower counts are at least 100
          followers = num;
          break;
        }
      }
    }
    
    // Determine tier from section headers above this line
    let tier = 'unknown';
    const beforeMatch = parseContent.slice(0, parseContent.indexOf(line));
    
    const lastTier1 = beforeMatch.lastIndexOf('## Tier 1');
    const lastTier2 = beforeMatch.lastIndexOf('## Tier 2');
    const lastTier3 = beforeMatch.lastIndexOf('## Tier 3');
    const lastMonitor = beforeMatch.lastIndexOf('## Monitor');
    const lastExcluded = beforeMatch.lastIndexOf('## Excluded');
    const lastHardware = beforeMatch.lastIndexOf('## Hardware');
    
    const maxPos = Math.max(lastTier1, lastTier2, lastTier3, lastMonitor, lastExcluded, lastHardware);
    
    if (maxPos === lastTier1) tier = 'tier1';
    else if (maxPos === lastTier2) tier = 'tier2';
    else if (maxPos === lastTier3) tier = 'tier3';
    else if (maxPos === lastMonitor) tier = 'monitor';
    else if (maxPos === lastExcluded) tier = 'excluded';
    else if (maxPos === lastHardware) tier = 'hardware';
    
    accounts[handle] = { followers, tier };
  }
  
  return accounts;
}

function getTierByFollowers(followers) {
  if (followers >= TIER_BOUNDARIES.tier1) return 'tier1';
  if (followers >= TIER_BOUNDARIES.tier2) return 'tier2';
  if (followers >= TIER_BOUNDARIES.tier3) return 'tier3';
  return 'excluded';
}

function formatFollowers(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

async function main() {
  console.log('🔍 Running tier review...\n');
  
  // Load secrets
  const env = loadSecrets(SECRETS_PATH);
  const { TWITTER_API_KEY: ck, TWITTER_API_SECRET: cs, TWITTER_ACCESS_TOKEN: tk, TWITTER_ACCESS_TOKEN_SECRET: ts } = env;
  
  if (!ck || !cs || !tk || !ts) {
    console.error('❌ Missing Twitter OAuth credentials in .env.secrets');
    process.exit(1);
  }
  
  // Fetch current following list
  console.log('📡 Fetching current following list...');
  const currentFollowing = await fetchAllFollowing(ck, cs, tk, ts);
  console.log(`✅ Found ${currentFollowing.length} accounts\n`);
  
  // Parse existing target accounts
  const targetAccounts = parseTargetAccounts(TARGET_ACCOUNTS_PATH);
  console.log(`📄 Parsed ${Object.keys(targetAccounts).length} accounts from target-accounts.md\n`);
  
  // Build current state map
  const currentMap = {};
  for (const user of currentFollowing) {
    currentMap[user.username.toLowerCase()] = {
      username: user.username,
      name: user.name,
      description: user.description || '',
      followers: user.public_metrics?.followers_count || 0
    };
  }
  
  // Analysis
  const report = {
    date: new Date().toISOString().split('T')[0],
    tierCrossings: [],
    newFollows: [],
    unfollowed: [],
    summary: {}
  };
  
  // Check tier crossings
  for (const [handle, current] of Object.entries(currentMap)) {
    const target = targetAccounts[handle];
    if (target) {
      const oldTier = target.tier;
      const newTier = getTierByFollowers(current.followers);
      
      // Check if tier should change based on followers
      if (oldTier !== 'excluded' && oldTier !== 'monitor' && oldTier !== 'hardware' && oldTier !== 'unknown') {
        const oldTierByFollowers = getTierByFollowers(target.followers);
        if (oldTierByFollowers !== newTier) {
          report.tierCrossings.push({
            handle: `@${current.username}`,
            name: current.name,
            oldFollowers: target.followers,
            newFollowers: current.followers,
            oldTier: oldTierByFollowers,
            newTier,
            direction: current.followers > target.followers ? 'up' : 'down',
            currentTier: oldTier
          });
        }
      }
    }
  }
  
  // Check for new follows not in target-accounts.md
  for (const [handle, current] of Object.entries(currentMap)) {
    if (!targetAccounts[handle]) {
      report.newFollows.push({
        handle: `@${current.username}`,
        name: current.name,
        followers: current.followers,
        suggestedTier: getTierByFollowers(current.followers),
        description: current.description.slice(0, 100)
      });
    }
  }
  
  // Check for unfollowed accounts still in target-accounts.md
  for (const handle of Object.keys(targetAccounts)) {
    if (!currentMap[handle] && targetAccounts[handle].tier !== 'excluded') {
      report.unfollowed.push({
        handle: `@${handle}`,
        tier: targetAccounts[handle].tier,
        followers: targetAccounts[handle].followers
      });
    }
  }
  
  // Build summary
  const tierCounts = { tier1: 0, tier2: 0, tier3: 0, excluded: 0 };
  for (const user of currentFollowing) {
    const tier = getTierByFollowers(user.public_metrics?.followers_count || 0);
    tierCounts[tier]++;
  }
  report.summary = tierCounts;
  
  // Generate report
  const reportDate = new Date().toISOString().split('T')[0];
  const reportPath = path.join(MEMORY_DIR, `tier-review-${reportDate}.md`);
  
  let reportContent = `# Tier Review — ${reportDate}\n\n`;
  reportContent += `**Following:** ${currentFollowing.length} accounts\n\n`;
  reportContent += `## Summary by Tier (by follower count only)\n`;
  reportContent += `- **Tier 1 (400K+):** ${tierCounts.tier1} accounts\n`;
  reportContent += `- **Tier 2 (50K-400K):** ${tierCounts.tier2} accounts\n`;
  reportContent += `- **Tier 3 (10K-50K):** ${tierCounts.tier3} accounts\n`;
  reportContent += `- **Below threshold (<10K):** ${tierCounts.excluded} accounts\n\n`;
  
  if (report.tierCrossings.length > 0) {
    reportContent += `## 🔄 Tier Boundary Crossings\n`;
    reportContent += `*These accounts crossed a follower threshold since last update:*\n\n`;
    for (const tc of report.tierCrossings) {
      const emoji = tc.direction === 'up' ? '📈' : '📉';
      reportContent += `- ${emoji} **${tc.handle}** (${tc.name}): ${formatFollowers(tc.oldFollowers)} → ${formatFollowers(tc.newFollowers)} `;
      reportContent += `(${tc.oldTier} → ${tc.newTier})\n`;
      if (tc.currentTier !== tc.newTier) {
        reportContent += `  - ⚠️ Currently listed as ${tc.currentTier}, should be ${tc.newTier}\n`;
      }
    }
    reportContent += '\n';
  } else {
    reportContent += `## ✅ No Tier Boundary Crossings\n\n`;
  }
  
  if (report.newFollows.length > 0) {
    reportContent += `## 🆕 New Follows (not in target-accounts.md)\n`;
    reportContent += `*Review and add to appropriate tier:*\n\n`;
    for (const nf of report.newFollows) {
      reportContent += `- **${nf.handle}** (${nf.name}): ${formatFollowers(nf.followers)} → Suggested: ${nf.suggestedTier}\n`;
      if (nf.description) {
        reportContent += `  - _"${nf.description}..."_\n`;
      }
    }
    reportContent += '\n';
  } else {
    reportContent += `## ✅ No New Follows to Add\n\n`;
  }
  
  if (report.unfollowed.length > 0) {
    reportContent += `## ❌ Unfollowed (still in target-accounts.md)\n`;
    reportContent += `*Remove from target-accounts.md:*\n\n`;
    for (const uf of report.unfollowed) {
      reportContent += `- **${uf.handle}** (was ${uf.tier}, ${formatFollowers(uf.followers)} followers)\n`;
    }
    reportContent += '\n';
  } else {
    reportContent += `## ✅ No Unfollowed Accounts to Remove\n\n`;
  }
  
  reportContent += `---\n`;
  reportContent += `*Generated by review-tiers.mjs at ${new Date().toISOString()}*\n`;
  reportContent += `*Does NOT auto-update target-accounts.md — recommendations for Lennart to approve.*\n`;
  
  // Write report
  fs.writeFileSync(reportPath, reportContent);
  console.log(`📝 Report written to: ${reportPath}\n`);
  
  // Update heartbeat state
  const heartbeatState = JSON.parse(fs.readFileSync(HEARTBEAT_STATE_PATH, 'utf8'));
  heartbeatState.lastChecks.tierReview = reportDate;
  fs.writeFileSync(HEARTBEAT_STATE_PATH, JSON.stringify(heartbeatState, null, 2));
  console.log(`✅ Updated heartbeat-state.json with lastChecks.tierReview\n`);
  
  // Console summary
  console.log('='.repeat(60));
  console.log('TIER REVIEW SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n📊 Following: ${currentFollowing.length} accounts`);
  console.log(`   Tier 1: ${tierCounts.tier1} | Tier 2: ${tierCounts.tier2} | Tier 3: ${tierCounts.tier3} | <10K: ${tierCounts.excluded}`);
  console.log(`\n🔄 Tier crossings: ${report.tierCrossings.length}`);
  console.log(`🆕 New follows to add: ${report.newFollows.length}`);
  console.log(`❌ Unfollowed to remove: ${report.unfollowed.length}`);
  console.log('\n' + '='.repeat(60));
  
  // Save current following to JSON for future reference
  const followingJsonPath = path.join(MEMORY_DIR, 'twitter-following-live.json');
  fs.writeFileSync(followingJsonPath, JSON.stringify(currentFollowing, null, 2));
  console.log(`\n📁 Updated: ${followingJsonPath}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
