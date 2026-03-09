#!/usr/bin/env node
/**
 * migrate-kb.mjs — One-time migration from knowledge-base.json to per-tool markdown files
 * 
 * Converts the monolithic KB to data/kb/{tool-slug}.md files with:
 * - YAML frontmatter (tool, slug, last_verified, source_url)
 * - Facts section
 * - Verified claims section
 * - Banned claims section
 * 
 * Usage:
 *   node migrate-kb.mjs                     # Run migration
 *   node migrate-kb.mjs --dry-run           # Preview without writing
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_JSON_PATH = path.join(__dirname, 'data', 'knowledge-base.json');
const KB_OUTPUT_DIR = path.join(__dirname, 'data', 'kb');

// Tools to migrate
const TARGET_TOOLS = ['claude', 'gemini', 'notebooklm', 'capcut'];

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractToolData(kb, toolNameLower) {
  const results = [];
  
  for (const [catName, category] of Object.entries(kb.categories || {})) {
    // Search in tools array
    if (category.tools) {
      for (const tool of category.tools) {
        if (tool.name.toLowerCase().includes(toolNameLower) || 
            slugify(tool.name) === toolNameLower) {
          results.push({ ...tool, category: catName, source: 'tools' });
        }
      }
    }
    
    // Search in comparison_table
    if (category.comparison_table) {
      for (const tool of category.comparison_table) {
        if (tool.name.toLowerCase().includes(toolNameLower) ||
            slugify(tool.name) === toolNameLower) {
          results.push({ ...tool, category: catName, source: 'comparison' });
        }
      }
    }
  }
  
  return results;
}

function generateMarkdown(toolName, toolData, verificationDate) {
  const slug = slugify(toolName);
  const primaryData = toolData.find(d => d.source === 'tools') || toolData[0];
  
  // Extract URL from data
  let sourceUrl = primaryData?.url || '';
  
  // Build frontmatter
  let md = `---
tool: ${toolName}
slug: ${slug}
last_verified: ${verificationDate}
source_url: ${sourceUrl}
---

`;

  // Facts section
  md += `## Facts\n`;
  
  // Consolidate facts from all sources
  const facts = new Set();
  
  for (const data of toolData) {
    if (data.free_tier) facts.add(`- free_tier: ${data.free_tier}`);
    if (data.paid) facts.add(`- paid_tier: ${data.paid}`);
    if (data.paid_from) facts.add(`- paid_from: ${data.paid_from}`);
    if (data.best_at) facts.add(`- best_at: ${data.best_at}`);
    if (data.worst_at) facts.add(`- worst_at: ${data.worst_at}`);
    if (data.learning_curve) facts.add(`- learning_curve: ${data.learning_curve}`);
    if (data.solopreneur_score) facts.add(`- solopreneur_score: ${data.solopreneur_score}/100`);
    if (data.march_2026_status) facts.add(`- march_2026_status: ${data.march_2026_status}`);
    if (data.march_2026_notes) facts.add(`- march_2026_notes: ${data.march_2026_notes}`);
    if (data.tagline) facts.add(`- tagline: "${data.tagline}"`);
    if (data.replaces) facts.add(`- replaces: ${data.replaces}`);
    if (Array.isArray(data.integrations)) {
      facts.add(`- integrations: ${data.integrations.join(', ')}`);
    }
  }
  
  md += Array.from(facts).join('\n') + '\n\n';
  
  // Verified claims section
  md += `## Verified claims (use these in content)\n`;
  
  const verifiedClaims = [];
  
  for (const data of toolData) {
    if (data.free_tier) {
      verifiedClaims.push(`- "${data.free_tier}" (free tier)`);
    }
    if (data.verdict) {
      verifiedClaims.push(`- "${data.verdict}"`);
    }
    if (data.tagline) {
      verifiedClaims.push(`- "${data.tagline}"`);
    }
  }
  
  // Add specific claims based on tool
  if (slug === 'claude') {
    verifiedClaims.push(`- "Sonnet 4.6 is the new default for free/Pro users"`);
    verifiedClaims.push(`- "Pro tier is $20/mo with 5x free usage"`);
  } else if (slug === 'gemini') {
    verifiedClaims.push(`- "15 requests per minute on free tier"`);
    verifiedClaims.push(`- "1,500 requests per day on free tier"`);
  } else if (slug === 'notebooklm') {
    verifiedClaims.push(`- "Completely free with Google account"`);
    verifiedClaims.push(`- "Audio Overview creates podcast-style summaries"`);
  } else if (slug === 'capcut') {
    verifiedClaims.push(`- "Full features free (with watermark options)"`);
    verifiedClaims.push(`- "Made by ByteDance (TikTok's parent company)"`);
  }
  
  md += verifiedClaims.length > 0 
    ? verifiedClaims.join('\n') + '\n\n'
    : '- (Add verified claims after research)\n\n';
  
  // Banned claims section
  md += `## Banned claims (do not use — unverified or outdated)\n`;
  md += `- "Best AI for [task]" — superlative, unverified\n`;
  md += `- "Saves X hours" — unless tested with specific workflow\n`;
  md += `- Any pricing without verification date\n`;
  
  // Content angles section if available
  const contentAngles = [];
  for (const data of toolData) {
    if (Array.isArray(data.content_angles)) {
      contentAngles.push(...data.content_angles);
    }
  }
  
  if (contentAngles.length > 0) {
    md += `\n## Content angles (verified hooks)\n`;
    for (const angle of contentAngles) {
      md += `- "${angle}"\n`;
    }
  }
  
  return md;
}

export async function migrateKnowledgeBase(options = {}) {
  const { dryRun = false } = options;
  const results = { migrated: [], skipped: [], errors: [] };
  
  // Load source KB
  const kbContent = await fs.readFile(KB_JSON_PATH, 'utf-8');
  const kb = JSON.parse(kbContent);
  
  const verificationDate = kb.research_sources?.verification_date || new Date().toISOString().split('T')[0];
  
  // Ensure output directory exists
  if (!dryRun) {
    await fs.mkdir(KB_OUTPUT_DIR, { recursive: true });
  }
  
  for (const toolName of TARGET_TOOLS) {
    try {
      const toolData = extractToolData(kb, toolName);
      
      if (toolData.length === 0) {
        results.skipped.push({ tool: toolName, reason: 'Not found in KB' });
        continue;
      }
      
      // Determine proper tool name from data
      const properName = toolData[0].name;
      const slug = slugify(properName);
      
      const markdown = generateMarkdown(properName, toolData, verificationDate);
      const outputPath = path.join(KB_OUTPUT_DIR, `${slug}.md`);
      
      if (dryRun) {
        console.log(`\n--- ${slug}.md (DRY RUN) ---`);
        console.log(markdown.substring(0, 500) + '...');
      } else {
        await fs.writeFile(outputPath, markdown, 'utf-8');
        console.log(`✅ Created ${slug}.md`);
      }
      
      results.migrated.push({ tool: properName, slug, path: outputPath });
      
    } catch (err) {
      results.errors.push({ tool: toolName, error: err.message });
      console.error(`❌ Error migrating ${toolName}: ${err.message}`);
    }
  }
  
  return results;
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`\n🔄 Migrating knowledge base...${dryRun ? ' (DRY RUN)' : ''}\n`);
  
  migrateKnowledgeBase({ dryRun })
    .then(results => {
      console.log('\n--- Migration Summary ---');
      console.log(`Migrated: ${results.migrated.length}`);
      console.log(`Skipped: ${results.skipped.length}`);
      console.log(`Errors: ${results.errors.length}`);
      
      if (results.skipped.length > 0) {
        console.log('\nSkipped tools:');
        for (const s of results.skipped) {
          console.log(`  - ${s.tool}: ${s.reason}`);
        }
      }
      
      if (results.errors.length > 0) {
        console.log('\nErrors:');
        for (const e of results.errors) {
          console.log(`  - ${e.tool}: ${e.error}`);
        }
      }
    })
    .catch(err => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
