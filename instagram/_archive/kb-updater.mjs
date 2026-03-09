#!/usr/bin/env node
/**
 * kb-updater.mjs — Re-verify KB facts via web search
 * 
 * Searches for current tool info and flags discrepancies for human review.
 * Does NOT auto-update — only generates a report.
 * 
 * Usage:
 *   node kb-updater.mjs                    # Update all stale tools
 *   node kb-updater.mjs --tool claude      # Update specific tool
 *   node kb-updater.mjs --all              # Force update all tools
 *   node kb-updater.mjs --dry-run          # Preview searches without running
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadKB, getToolSlugs, checkStaleness } from './kb-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, 'data', 'kb');
const ENV_PATH = path.join(__dirname, '.env.secrets');

// Load environment variables
async function loadEnv() {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      if (line.startsWith('#') || !line.includes('=')) continue;
      const [key, ...valueParts] = line.split('=');
      env[key.trim()] = valueParts.join('=').trim();
    }
    return env;
  } catch (err) {
    return {};
  }
}

/**
 * Search the web using Brave Search API
 */
async function webSearch(query, braveApiKey) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '5');
  
  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': braveApiKey
    }
  });
  
  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return (data.web?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    description: r.description
  }));
}

/**
 * Generate search queries for a tool
 */
function generateSearchQueries(toolName) {
  const currentDate = new Date();
  const month = currentDate.toLocaleString('en-US', { month: 'long' });
  const year = currentDate.getFullYear();
  
  return [
    `${toolName} free tier limits ${month} ${year}`,
    `${toolName} pricing ${year}`,
    `${toolName} AI features update ${year}`
  ];
}

/**
 * Extract key facts from search results
 */
function extractFactsFromResults(results, toolName) {
  const extractedFacts = [];
  
  for (const result of results) {
    const text = `${result.title} ${result.description}`.toLowerCase();
    
    // Look for pricing patterns
    const pricingMatch = text.match(/\$(\d+(?:\.\d{2})?)\s*(?:\/|\s*per\s*)(?:mo|month)/i);
    if (pricingMatch) {
      extractedFacts.push({
        type: 'pricing',
        value: `$${pricingMatch[1]}/mo`,
        source: result.url
      });
    }
    
    // Look for free tier mentions
    if (text.includes('free') && (text.includes('tier') || text.includes('plan'))) {
      const freeMatch = text.match(/(free[^.]{0,100})/i);
      if (freeMatch) {
        extractedFacts.push({
          type: 'free_tier',
          value: freeMatch[1].trim(),
          source: result.url
        });
      }
    }
    
    // Look for limit patterns (requests, messages, etc.)
    const limitMatch = text.match(/(\d+)\s*(messages?|requests?|generations?|credits?)\s*(?:per|\/)\s*(day|hour|minute|month)/i);
    if (limitMatch) {
      extractedFacts.push({
        type: 'limit',
        value: `${limitMatch[1]} ${limitMatch[2]} per ${limitMatch[3]}`,
        source: result.url
      });
    }
  }
  
  return extractedFacts;
}

/**
 * Compare extracted facts with current KB
 */
function compareWithKB(extractedFacts, kbTool) {
  const discrepancies = [];
  const confirmed = [];
  
  for (const fact of extractedFacts) {
    let found = false;
    
    // Check against KB facts
    for (const [key, value] of Object.entries(kbTool.facts)) {
      if (key.toLowerCase().includes(fact.type.replace('_', ''))) {
        // Normalize for comparison
        const kbValue = value.toLowerCase().replace(/[^a-z0-9$]/g, '');
        const newValue = fact.value.toLowerCase().replace(/[^a-z0-9$]/g, '');
        
        if (kbValue.includes(newValue) || newValue.includes(kbValue)) {
          confirmed.push({ fact, kbKey: key, kbValue: value });
          found = true;
        } else {
          discrepancies.push({
            type: 'mismatch',
            factType: fact.type,
            kbValue: value,
            newValue: fact.value,
            source: fact.source
          });
          found = true;
        }
        break;
      }
    }
    
    if (!found) {
      // New fact not in KB
      discrepancies.push({
        type: 'new_info',
        factType: fact.type,
        value: fact.value,
        source: fact.source
      });
    }
  }
  
  return { discrepancies, confirmed };
}

/**
 * Update a single tool's KB file (only update last_verified date)
 */
async function updateToolLastVerified(slug) {
  const filePath = path.join(KB_DIR, `${slug}.md`);
  const content = await fs.readFile(filePath, 'utf-8');
  
  const today = new Date().toISOString().split('T')[0];
  const updated = content.replace(
    /^last_verified:\s*.+$/m,
    `last_verified: ${today}`
  );
  
  await fs.writeFile(filePath, updated, 'utf-8');
  return today;
}

/**
 * Generate update report for a tool
 */
async function generateToolReport(toolSlug, kb, braveApiKey, options = {}) {
  const { dryRun = false } = options;
  
  const tool = kb.get(toolSlug.toLowerCase());
  if (!tool) {
    return { error: `Tool ${toolSlug} not found in KB` };
  }
  
  const queries = generateSearchQueries(tool.tool);
  const allResults = [];
  
  console.log(`\n🔍 Researching ${tool.tool}...`);
  
  if (dryRun) {
    console.log('  Queries (dry run):');
    for (const q of queries) {
      console.log(`    - ${q}`);
    }
    return { tool: tool.tool, slug: tool.slug, dryRun: true };
  }
  
  for (const query of queries) {
    console.log(`  Searching: ${query.substring(0, 50)}...`);
    try {
      const results = await webSearch(query, braveApiKey);
      allResults.push(...results);
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.log(`    ⚠️ Search failed: ${err.message}`);
    }
  }
  
  if (allResults.length === 0) {
    return { 
      tool: tool.tool, 
      slug: tool.slug, 
      error: 'No search results',
      noChanges: true 
    };
  }
  
  const extractedFacts = extractFactsFromResults(allResults, tool.tool);
  const { discrepancies, confirmed } = compareWithKB(extractedFacts, tool);
  
  return {
    tool: tool.tool,
    slug: tool.slug,
    lastVerified: tool.lastVerified,
    searchResultsCount: allResults.length,
    extractedFactsCount: extractedFacts.length,
    discrepancies,
    confirmed,
    sources: [...new Set(allResults.map(r => r.url))]
  };
}

/**
 * Run the full update process
 */
export async function updateKB(options = {}) {
  const { toolSlug = null, forceAll = false, dryRun = false, updateDates = false } = options;
  
  const env = await loadEnv();
  const braveApiKey = env.BRAVE_API_KEY;
  
  if (!braveApiKey && !dryRun) {
    throw new Error('BRAVE_API_KEY not found in .env.secrets');
  }
  
  const kb = await loadKB();
  const reports = [];
  
  let toolsToUpdate = [];
  
  if (toolSlug) {
    toolsToUpdate = [toolSlug];
  } else if (forceAll) {
    toolsToUpdate = await getToolSlugs();
  } else {
    const { stale } = await checkStaleness();
    toolsToUpdate = stale.map(t => t.slug);
  }
  
  if (toolsToUpdate.length === 0) {
    console.log('✅ All tools are fresh — no updates needed');
    return { reports: [], summary: { total: 0, withDiscrepancies: 0, withErrors: 0, clean: 0 } };
  }
  
  console.log(`\n📊 KB Updater - ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Tools to check: ${toolsToUpdate.join(', ')}\n`);
  
  for (const slug of toolsToUpdate) {
    const report = await generateToolReport(slug, kb, braveApiKey, { dryRun });
    reports.push(report);
    
    // Update last_verified if requested and no discrepancies
    if (updateDates && !dryRun && !report.error && report.discrepancies?.length === 0) {
      const newDate = await updateToolLastVerified(slug);
      report.lastVerifiedUpdated = newDate;
      console.log(`  ✅ Updated last_verified to ${newDate}`);
    }
  }
  
  // Generate summary
  const withDiscrepancies = reports.filter(r => r.discrepancies?.length > 0);
  const withErrors = reports.filter(r => r.error);
  const clean = reports.filter(r => !r.error && r.discrepancies?.length === 0);
  
  const summary = {
    total: reports.length,
    withDiscrepancies: withDiscrepancies.length,
    withErrors: withErrors.length,
    clean: clean.length
  };
  
  return { reports, summary };
}

/**
 * Format report for display
 */
function formatReport(result) {
  let output = '';
  
  output += `\n${'='.repeat(60)}\n`;
  output += `📦 ${result.tool} (${result.slug})\n`;
  output += `${'='.repeat(60)}\n`;
  
  if (result.dryRun) {
    output += `[DRY RUN - no searches performed]\n`;
    return output;
  }
  
  if (result.error) {
    output += `⚠️ Error: ${result.error}\n`;
    return output;
  }
  
  output += `Last verified: ${result.lastVerified}\n`;
  output += `Search results: ${result.searchResultsCount}\n`;
  output += `Facts extracted: ${result.extractedFactsCount}\n`;
  
  if (result.confirmed?.length > 0) {
    output += `\n✅ Confirmed (${result.confirmed.length}):\n`;
    for (const c of result.confirmed.slice(0, 3)) {
      output += `  - ${c.kbKey}: ${c.kbValue}\n`;
    }
  }
  
  if (result.discrepancies?.length > 0) {
    output += `\n⚠️ Discrepancies (${result.discrepancies.length}):\n`;
    for (const d of result.discrepancies) {
      if (d.type === 'mismatch') {
        output += `  - ${d.factType}: KB says "${d.kbValue}" but found "${d.newValue}"\n`;
        output += `    Source: ${d.source}\n`;
      } else {
        output += `  - NEW: ${d.factType} = "${d.value}"\n`;
        output += `    Source: ${d.source}\n`;
      }
    }
  } else {
    output += `\n✅ No discrepancies found\n`;
  }
  
  if (result.lastVerifiedUpdated) {
    output += `\n📅 Updated last_verified to ${result.lastVerifiedUpdated}\n`;
  }
  
  return output;
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  
  const options = {
    toolSlug: null,
    forceAll: false,
    dryRun: false,
    updateDates: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tool' && args[i + 1]) {
      options.toolSlug = args[++i];
    } else if (args[i] === '--all') {
      options.forceAll = true;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--update-dates') {
      options.updateDates = true;
    } else if (args[i] === '--help') {
      console.log('Usage:');
      console.log('  node kb-updater.mjs                    # Update stale tools only');
      console.log('  node kb-updater.mjs --tool claude      # Update specific tool');
      console.log('  node kb-updater.mjs --all              # Force update all tools');
      console.log('  node kb-updater.mjs --dry-run          # Preview without searching');
      console.log('  node kb-updater.mjs --update-dates     # Update last_verified if clean');
      process.exit(0);
    }
  }
  
  updateKB(options)
    .then(({ reports, summary }) => {
      for (const report of reports) {
        console.log(formatReport(report));
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 Summary');
      console.log('='.repeat(60));
      console.log(`Total tools checked: ${summary.total}`);
      console.log(`Clean: ${summary.clean}`);
      console.log(`With discrepancies: ${summary.withDiscrepancies}`);
      console.log(`With errors: ${summary.withErrors}`);
      
      if (summary.withDiscrepancies > 0) {
        console.log('\n⚠️ Review discrepancies above and update KB manually');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
