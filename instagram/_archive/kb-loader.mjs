#!/usr/bin/env node
/**
 * kb-loader.mjs — Load and parse per-tool KB markdown files
 * 
 * Provides structured access to tool knowledge base with staleness checking.
 * 
 * Usage:
 *   import { loadKB, getToolFacts, checkStaleness } from './kb-loader.mjs'
 *   const kb = await loadKB();
 *   const claude = kb.get('claude');
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, 'data', 'kb');

// Default staleness threshold in days
const DEFAULT_STALE_DAYS = 14;

/**
 * Parse YAML-style frontmatter from markdown
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: content };
  
  const frontmatterStr = match[1];
  const body = content.slice(match[0].length).trim();
  
  const frontmatter = {};
  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }
  
  return { frontmatter, body };
}

/**
 * Parse a section from markdown body
 */
function parseSection(body, sectionName) {
  const regex = new RegExp(`## ${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = body.match(regex);
  if (!match) return [];
  
  const lines = match[1].trim().split('\n');
  return lines
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim());
}

/**
 * Parse facts section into key-value pairs
 */
function parseFacts(body) {
  const facts = {};
  const factLines = parseSection(body, 'Facts');
  
  for (const line of factLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      facts[key] = value;
    }
  }
  
  return facts;
}

/**
 * Parse a single KB file
 */
async function parseKBFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  
  const facts = parseFacts(body);
  const verifiedClaims = parseSection(body, 'Verified claims');
  const bannedClaims = parseSection(body, 'Banned claims');
  const contentAngles = parseSection(body, 'Content angles');
  
  // Calculate staleness
  const lastVerified = frontmatter.last_verified ? new Date(frontmatter.last_verified) : null;
  const daysSinceVerified = lastVerified 
    ? Math.floor((Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;
  
  return {
    tool: frontmatter.tool || path.basename(filePath, '.md'),
    slug: frontmatter.slug || path.basename(filePath, '.md'),
    sourceUrl: frontmatter.source_url || '',
    lastVerified: frontmatter.last_verified || null,
    daysSinceVerified,
    isStale: daysSinceVerified > DEFAULT_STALE_DAYS,
    facts,
    verifiedClaims,
    bannedClaims,
    contentAngles,
    rawContent: content
  };
}

/**
 * Load all KB files into a Map
 * @returns {Promise<Map<string, object>>}
 */
export async function loadKB() {
  const kb = new Map();
  
  try {
    const files = await fs.readdir(KB_DIR);
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      
      const filePath = path.join(KB_DIR, file);
      const toolData = await parseKBFile(filePath);
      
      // Index by both slug and tool name
      kb.set(toolData.slug.toLowerCase(), toolData);
      kb.set(toolData.tool.toLowerCase(), toolData);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('KB directory not found. Run migrate-kb.mjs first.');
    } else {
      throw err;
    }
  }
  
  return kb;
}

/**
 * Get facts for a specific tool
 * @param {string} toolName - Tool name or slug
 * @returns {Promise<object|null>}
 */
export async function getToolFacts(toolName) {
  const kb = await loadKB();
  return kb.get(toolName.toLowerCase()) || null;
}

/**
 * Check which tools are stale and need verification
 * @param {number} staleDays - Days after which a tool is considered stale
 * @returns {Promise<{stale: array, fresh: array}>}
 */
export async function checkStaleness(staleDays = DEFAULT_STALE_DAYS) {
  const kb = await loadKB();
  const stale = [];
  const fresh = [];
  const seen = new Set();
  
  for (const [key, tool] of kb) {
    if (seen.has(tool.slug)) continue;
    seen.add(tool.slug);
    
    if (tool.daysSinceVerified > staleDays) {
      stale.push({
        tool: tool.tool,
        slug: tool.slug,
        lastVerified: tool.lastVerified,
        daysSinceVerified: tool.daysSinceVerified
      });
    } else {
      fresh.push({
        tool: tool.tool,
        slug: tool.slug,
        lastVerified: tool.lastVerified,
        daysSinceVerified: tool.daysSinceVerified
      });
    }
  }
  
  return { stale, fresh };
}

/**
 * Get all tool slugs in the KB
 * @returns {Promise<string[]>}
 */
export async function getToolSlugs() {
  const kb = await loadKB();
  const slugs = new Set();
  
  for (const [, tool] of kb) {
    slugs.add(tool.slug);
  }
  
  return Array.from(slugs);
}

/**
 * Verify a claim against the KB
 * @param {string} claim - Claim to verify
 * @param {string} toolName - Tool the claim is about
 * @returns {Promise<{verified: boolean, source: string|null, bannedMatch: string|null}>}
 */
export async function verifyClaim(claim, toolName) {
  const tool = await getToolFacts(toolName);
  if (!tool) {
    return { verified: false, source: null, bannedMatch: null };
  }
  
  // Check if claim matches a verified claim
  for (const verified of tool.verifiedClaims) {
    if (claim.toLowerCase().includes(verified.toLowerCase().replace(/^"|"$/g, ''))) {
      return { verified: true, source: verified, bannedMatch: null };
    }
  }
  
  // Check if claim matches a banned claim
  for (const banned of tool.bannedClaims) {
    if (claim.toLowerCase().includes(banned.toLowerCase().replace(/^"|"$/g, ''))) {
      return { verified: false, source: null, bannedMatch: banned };
    }
  }
  
  // Claim not found in either list
  return { verified: false, source: null, bannedMatch: null };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage:');
    console.log('  node kb-loader.mjs --list              List all tools');
    console.log('  node kb-loader.mjs --check-stale       Check for stale tools');
    console.log('  node kb-loader.mjs --get <tool>        Get facts for a tool');
    process.exit(0);
  }
  
  if (args[0] === '--list') {
    getToolSlugs()
      .then(slugs => {
        console.log('Tools in KB:');
        for (const slug of slugs) {
          console.log(`  - ${slug}`);
        }
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else if (args[0] === '--check-stale') {
    checkStaleness()
      .then(({ stale, fresh }) => {
        console.log(`\n📊 KB Staleness Report\n`);
        
        if (stale.length > 0) {
          console.log('⚠️  Stale tools (need verification):');
          for (const t of stale) {
            console.log(`  - ${t.tool}: ${t.daysSinceVerified} days since ${t.lastVerified}`);
          }
        }
        
        console.log('\n✅ Fresh tools:');
        for (const t of fresh) {
          console.log(`  - ${t.tool}: ${t.daysSinceVerified} days since ${t.lastVerified}`);
        }
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else if (args[0] === '--get' && args[1]) {
    getToolFacts(args[1])
      .then(tool => {
        if (!tool) {
          console.log(`Tool "${args[1]}" not found in KB`);
          process.exit(1);
        }
        
        console.log(`\n📦 ${tool.tool}\n`);
        console.log(`Slug: ${tool.slug}`);
        console.log(`Last verified: ${tool.lastVerified} (${tool.daysSinceVerified} days ago)`);
        console.log(`Stale: ${tool.isStale ? '⚠️ Yes' : '✅ No'}`);
        console.log(`Source: ${tool.sourceUrl || 'N/A'}`);
        
        console.log('\nFacts:');
        for (const [k, v] of Object.entries(tool.facts)) {
          console.log(`  ${k}: ${v}`);
        }
        
        console.log('\nVerified claims:');
        for (const claim of tool.verifiedClaims) {
          console.log(`  - ${claim}`);
        }
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  }
}
