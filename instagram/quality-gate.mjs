#!/usr/bin/env node
/**
 * quality-gate.mjs — Content quality gate for @toolsforbuilders
 * 
 * Checks generated scripts against content-strategy.md rules.
 * Runs BEFORE Telegram approval to block bad drafts automatically.
 * 
 * Usage:
 *   CLI: node quality-gate.mjs path/to/script.json
 *   Module: import { checkQuality } from './quality-gate.mjs'
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load knowledge base for tool/feature verification
async function loadKnowledgeBase() {
  const kbDir = path.join(__dirname, 'data', 'kb');
  const tools = new Map();
  
  try {
    const files = await fs.readdir(kbDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = await fs.readFile(path.join(kbDir, file), 'utf-8');
      const slug = file.replace('.md', '');
      
      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const toolMatch = frontmatter.match(/^tool:\s*(.+)$/m);
        const toolName = toolMatch ? toolMatch[1].trim() : slug;
        
        // Extract facts section
        const factsMatch = content.match(/## Facts\n([\s\S]*?)(?=\n## |$)/);
        const facts = factsMatch ? factsMatch[1].trim() : '';
        
        // Extract verified claims
        const verifiedMatch = content.match(/## Verified claims[^\n]*\n([\s\S]*?)(?=\n## |$)/);
        const verifiedClaims = verifiedMatch ? verifiedMatch[1].trim() : '';
        
        tools.set(toolName.toLowerCase(), { slug, toolName, facts, verifiedClaims, content });
        tools.set(slug.toLowerCase(), { slug, toolName, facts, verifiedClaims, content });
      }
    }
  } catch (err) {
    // KB directory might not exist yet — fall back to legacy JSON
    try {
      const legacyKB = JSON.parse(await fs.readFile(path.join(__dirname, 'data', 'knowledge-base.json'), 'utf-8'));
      // Extract tool names from categories
      for (const [catName, category] of Object.entries(legacyKB.categories || {})) {
        if (category.tools) {
          for (const tool of category.tools) {
            const slug = tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            tools.set(tool.name.toLowerCase(), { slug, toolName: tool.name, facts: JSON.stringify(tool), content: '' });
            tools.set(slug, { slug, toolName: tool.name, facts: JSON.stringify(tool), content: '' });
          }
        }
        if (category.comparison_table) {
          for (const tool of category.comparison_table) {
            const slug = tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            tools.set(tool.name.toLowerCase(), { slug, toolName: tool.name, facts: JSON.stringify(tool), content: '' });
            tools.set(slug, { slug, toolName: tool.name, facts: JSON.stringify(tool), content: '' });
          }
        }
      }
    } catch (e) {
      console.warn('Warning: Could not load knowledge base');
    }
  }
  
  return tools;
}

// Extract all text from a script for analysis
function extractText(script) {
  const texts = [];
  
  // Top-level text fields
  const textFields = ['hookHeadline', 'hookSub', 'hookTTS', 'agitateMain', 'agitateBridge', 'agitateTTS', 
                      'proofStat', 'proofContext', 'proofSource', 'proofTTS',
                      'ctaSaveText', 'ctaValueProp', 'ctaSecondary', 'ctaTTS'];
  
  for (const field of textFields) {
    if (script[field]) texts.push({ field, text: script[field] });
  }
  
  // Points (slides)
  if (Array.isArray(script.points)) {
    for (let i = 0; i < script.points.length; i++) {
      const point = script.points[i];
      if (point.verdict) texts.push({ field: `points[${i}].verdict`, text: point.verdict });
      if (point.tts) texts.push({ field: `points[${i}].tts`, text: point.tts });
      if (point.quickWin) texts.push({ field: `points[${i}].quickWin`, text: point.quickWin });
      if (Array.isArray(point.bullets)) {
        for (let j = 0; j < point.bullets.length; j++) {
          texts.push({ field: `points[${i}].bullets[${j}]`, text: point.bullets[j] });
        }
      }
    }
  }
  
  return texts;
}

// Extract tool names mentioned in script
function extractToolNames(script) {
  const tools = new Set();
  
  if (Array.isArray(script.points)) {
    for (const point of script.points) {
      if (point.toolName) tools.add(point.toolName.toLowerCase());
    }
  }
  
  return tools;
}

// Hard Block Checks
const hardBlockChecks = [
  {
    id: 'HB-1',
    name: 'Unverifiable superlative',
    check: (texts, script, kb) => {
      // "only" is excluded when used as a conditional connector (only if/when/after/before/because)
      const superlatives = /\b(best|fastest|most powerful|#1|number one|greatest|top|leading)\b|\bonly\b(?! if| when| after| before| because| once| then| for| with)/gi;
      const issues = [];
      
      for (const { field, text } of texts) {
        const matches = text.match(superlatives);
        if (matches) {
          // Check if there's a citation nearby (source, verified, etc.)
          const hasCitation = /source|verified|according to|benchmark|test/i.test(text);
          if (!hasCitation) {
            issues.push({ field, text: text.substring(0, 100), match: matches.join(', ') });
          }
        }
      }
      
      return issues;
    }
  },
  {
    id: 'HB-2',
    name: 'Tool name/feature not in knowledge base',
    check: (texts, script, kb) => {
      const toolNames = extractToolNames(script);
      const issues = [];
      
      for (const tool of toolNames) {
        // Check various forms of the tool name
        const found = kb.has(tool) || 
                      kb.has(tool.replace(/\s+/g, '')) ||
                      kb.has(tool.replace(/\s+/g, '-'));
        
        if (!found) {
          issues.push({ field: 'toolName', text: tool, match: 'Not found in KB' });
        }
      }
      
      return issues;
    }
  },
  {
    id: 'HB-3',
    name: 'Invented stats (numbers not traceable)',
    check: (texts, script, kb) => {
      // Stats that need verification: specific percentages, dollar amounts, time claims
      const statsPattern = /\b(\d+(?:\.\d+)?%|\$\d+(?:,\d{3})*(?:\.\d{2})?|\d+x|\d+(?:k|K|million|billion)?(?:\s+(?:users|downloads|customers|people)))/g;
      const issues = [];
      
      for (const { field, text } of texts) {
        const matches = text.match(statsPattern);
        if (matches) {
          // Allow common verified patterns
          const allowedPatterns = [
            /~?\$\d+\/mo/,          // Pricing like $20/mo
            /\d+ min(ute)?s?/i,     // Time like "20 minutes"
            /\d+ hours?/i,          // Hours
            /\d+ slides?/i,         // Slide counts
            /\d+ steps?/i,          // Step counts
            /free/i,                // Free tier mentions
            /5-hour reset/i,        // Known free tier reset
            /~40/,                  // Known Claude message limit
          ];
          
          for (const match of matches) {
            const isAllowed = allowedPatterns.some(p => p.test(text));
            if (!isAllowed) {
              // Check if in proofSource or has verification context
              const hasSource = field.includes('proofSource') || /verified|tested|source|benchmark/i.test(text);
              if (!hasSource) {
                issues.push({ field, text: text.substring(0, 100), match });
              }
            }
          }
        }
      }
      
      return issues;
    }
  },
  {
    id: 'HB-4',
    name: 'Feature without workflow context',
    check: (texts, script, kb) => {
      // Detects "X can do Y" or "X has Y" without action verbs
      const featurePatterns = [
        /\b(?:can|has|is able to|offers|provides|includes|features)\s+(?:a\s+)?(?:powerful|great|excellent|amazing)?\s*\w+/gi,
      ];
      const actionVerbs = /\b(upload|paste|ask|open|click|type|copy|download|export|import|drag|drop|run|execute|create|generate|write|edit|send|share|save|add|remove|delete|move|find|search|select|choose|compare|analyze|review|check|verify)\b/i;
      
      const issues = [];
      
      for (const { field, text } of texts) {
        // Skip TTS fields — they naturally have more description
        if (field.includes('TTS') || field.includes('tts')) continue;
        
        // Check if line describes rather than instructs
        if (/\bcan\s+\w+|\bhas\s+\w+|\boffers\b|\bprovides\b/i.test(text)) {
          if (!actionVerbs.test(text)) {
            issues.push({ field, text: text.substring(0, 100), match: 'Describes feature without action' });
          }
        }
      }
      
      return issues;
    }
  },
  {
    id: 'HB-5',
    name: 'Vague outcome claim',
    check: (texts, script, kb) => {
      const vaguePatterns = [
        /\b(save time|be more productive|work smarter|improve efficiency|boost productivity|be more efficient|work faster|get more done)\b/gi,
      ];
      const specificPatterns = /\d+\s*(hours?|minutes?|min|hr|%|x|times)/i;
      
      const issues = [];
      
      for (const { field, text } of texts) {
        for (const pattern of vaguePatterns) {
          pattern.lastIndex = 0;
          const matches = text.match(pattern);
          if (matches) {
            // Check if there's a specific number nearby
            if (!specificPatterns.test(text)) {
              issues.push({ field, text: text.substring(0, 100), match: matches.join(', ') });
            }
          }
        }
      }
      
      return issues;
    }
  },
  {
    id: 'HB-6',
    name: 'TTS length limit exceeded',
    check: (texts, script, kb) => {
      // Hard limits — enforced before any ElevenLabs API calls are made
      // Per-segment limits calibrated to Eric (ElevenLabs) voice timing
      const SEGMENT_LIMITS = {
        hookTTS:    18,
        agitateTTS: 18,
        proofTTS:   20,
        ctaTTS:     13,
        pointTTS:   27, // each points[].tts
      };
      const MAX_TOTAL_WORDS = 125; // calibrated from actual renders: 127 words = 47.5s; leaves headroom under 55s hard cap

      const issues = [];

      // Collect all TTS segments with their per-segment limits
      const ttsSegments = [
        { field: 'hookTTS',    text: script.hookTTS    || '', max: SEGMENT_LIMITS.hookTTS },
        { field: 'agitateTTS', text: script.agitateTTS || '', max: SEGMENT_LIMITS.agitateTTS },
        ...(script.points || []).map((p, i) => ({ field: `points[${i}].tts`, text: p.tts || '', max: SEGMENT_LIMITS.pointTTS })),
        { field: 'proofTTS',   text: script.proofTTS   || '', max: SEGMENT_LIMITS.proofTTS },
        { field: 'ctaTTS',     text: script.ctaTTS     || '', max: SEGMENT_LIMITS.ctaTTS },
      ];

      let totalWords = 0;

      for (const seg of ttsSegments) {
        const words = seg.text.trim().split(/\s+/).filter(Boolean).length;
        totalWords += words;
        if (words > seg.max) {
          issues.push({
            field: seg.field,
            text: seg.text.substring(0, 80),
            match: `${words} words (max ${seg.max})`
          });
        }
      }

      if (totalWords > MAX_TOTAL_WORDS) {
        issues.push({
          field: 'total_tts',
          text: `All TTS segments combined`,
          match: `${totalWords} total words (max ${MAX_TOTAL_WORDS} = ~55s). Trim segments to fit.`
        });
      }

      return issues;
    }
  },
  {
    id: 'HB-7',
    name: 'Comparison hook missing both tool names',
    check: (texts, script, kb) => {
      // Only applies to Comparison pillar scripts
      if ((script.pillar || '').toLowerCase() !== 'comparison') return [];

      // Collect all tool names used in the script
      const toolNames = (script.points || [])
        .map(p => (p.toolName || '').toLowerCase().trim())
        .filter(Boolean);

      const uniqueTools = [...new Set(toolNames)];

      // Comparison requires at least 2 distinct tools
      if (uniqueTools.length < 2) {
        return [{
          field: 'points[].toolName',
          text: `Found tools: ${uniqueTools.join(', ') || 'none'}`,
          match: `Comparison script must feature at least 2 distinct tools — found ${uniqueTools.length}`
        }];
      }

      // Both tool names must appear in the hook (headline + TTS combined)
      const hookText = [
        (script.hookHeadline || ''),
        (script.hookTTS || ''),
      ].join(' ').toLowerCase();

      const missingFromHook = uniqueTools.filter(tool => {
        // Check for the tool name or a common abbreviation
        const toolWords = tool.split(/[\s\-\.]+/);
        return !toolWords.some(word => word.length > 2 && hookText.includes(word));
      });

      if (missingFromHook.length > 0) {
        return [{
          field: 'hookHeadline + hookTTS',
          text: `Hook: "${(script.hookHeadline || '').substring(0, 80)}"`,
          match: `Comparison hook must name both tools. Missing: ${missingFromHook.join(', ')}`
        }];
      }

      return [];
    }
  }
];

// Soft Block Checks
// (HB-6 is the last hard block above)
const softBlockChecks = [
  {
    id: 'SB-1',
    name: 'Em dash used as connector',
    check: (texts, script, kb) => {
      const emDash = /—/g;
      const issues = [];
      
      for (const { field, text } of texts) {
        if (emDash.test(text)) {
          issues.push({ field, text: text.substring(0, 100), match: '—' });
        }
      }
      
      return issues;
    }
  },
  {
    id: 'SB-2',
    name: 'Hedge language',
    check: (texts, script, kb) => {
      const hedges = /\b(might|could potentially|some say|perhaps|possibly|it seems|appears to|may be|kind of|sort of|somewhat)\b/gi;
      const issues = [];
      
      for (const { field, text } of texts) {
        const matches = text.match(hedges);
        if (matches) {
          issues.push({ field, text: text.substring(0, 100), match: matches.join(', ') });
        }
      }
      
      return issues;
    }
  },
  {
    id: 'SB-3',
    name: 'Slide has fewer than 3 actionable bullets',
    check: (texts, script, kb) => {
      const issues = [];
      const actionVerbs = /^(?:find|upload|ask|open|paste|add|click|type|copy|download|export|import|drag|drop|run|execute|create|generate|write|edit|send|share|save|remove|delete|move|search|select|choose|compare|analyze|review|check|verify|iterate|fix|turn|take|that|now)/i;
      
      if (Array.isArray(script.points)) {
        for (let i = 0; i < script.points.length; i++) {
          const point = script.points[i];
          if (Array.isArray(point.bullets)) {
            const actionableBullets = point.bullets.filter(b => actionVerbs.test(b.trim()));
            if (actionableBullets.length < 3) {
              issues.push({ 
                field: `points[${i}]`, 
                text: `${point.toolName || 'Slide'}: ${point.bullets.length} bullets, ${actionableBullets.length} actionable`,
                match: 'Needs 3+ actionable bullets'
              });
            }
          }
        }
      }
      
      return issues;
    }
  },
  {
    id: 'SB-4',
    name: 'No specific number in full script',
    check: (texts, script, kb) => {
      const allText = texts.map(t => t.text).join(' ');
      const hasNumber = /\d+/.test(allText);
      
      if (!hasNumber) {
        return [{ field: 'script', text: 'No numbers found in entire script', match: 'Missing specificity' }];
      }
      return [];
    }
  },
  {
    id: 'SB-5',
    name: 'CTA does not include "save this" variant',
    check: (texts, script, kb) => {
      const ctaFields = texts.filter(t => t.field.toLowerCase().includes('cta'));
      const hasSave = ctaFields.some(t => /save\s*(this|it|now)/i.test(t.text));
      
      if (!hasSave) {
        return [{ field: 'CTA', text: 'CTA missing "save this" variant', match: 'Add save CTA' }];
      }
      return [];
    }
  }
];

/**
 * Check script quality against content strategy rules
 * @param {object|string} scriptOrPath - Script object or path to JSON file
 * @returns {Promise<{passed: boolean, hardBlocks: array, softBlocks: array, report: string}>}
 */
export async function checkQuality(scriptOrPath) {
  let script;
  
  if (typeof scriptOrPath === 'string') {
    const content = await fs.readFile(scriptOrPath, 'utf-8');
    script = JSON.parse(content);
  } else {
    script = scriptOrPath;
  }
  
  const kb = await loadKnowledgeBase();
  const texts = extractText(script);
  
  const hardBlocks = [];
  const softBlocks = [];
  
  // Run hard block checks
  for (const check of hardBlockChecks) {
    const issues = check.check(texts, script, kb);
    if (issues.length > 0) {
      hardBlocks.push({
        id: check.id,
        name: check.name,
        issues
      });
    }
  }
  
  // Run soft block checks
  for (const check of softBlockChecks) {
    const issues = check.check(texts, script, kb);
    if (issues.length > 0) {
      softBlocks.push({
        id: check.id,
        name: check.name,
        issues
      });
    }
  }
  
  const passed = hardBlocks.length === 0;
  
  // Generate report
  let report = `# Quality Gate Report\n\n`;
  report += `**Script:** ${script.id || 'Unknown'}\n`;
  report += `**Status:** ${passed ? '✅ PASSED' : '❌ BLOCKED'}\n\n`;
  
  if (hardBlocks.length > 0) {
    report += `## ❌ Hard Blocks (must fix)\n\n`;
    for (const block of hardBlocks) {
      report += `### ${block.id}: ${block.name}\n`;
      for (const issue of block.issues) {
        report += `- **${issue.field}**: "${issue.text}..." → ${issue.match}\n`;
      }
      report += '\n';
    }
  }
  
  if (softBlocks.length > 0) {
    report += `## ⚠️ Soft Blocks (review recommended)\n\n`;
    for (const block of softBlocks) {
      report += `### ${block.id}: ${block.name}\n`;
      for (const issue of block.issues) {
        report += `- **${issue.field}**: "${issue.text}..." → ${issue.match}\n`;
      }
      report += '\n';
    }
  }
  
  if (passed && softBlocks.length === 0) {
    report += `✨ No issues found. Script passes all quality checks.\n`;
  } else if (passed) {
    report += `\n---\n*Script passed but has ${softBlocks.length} soft warnings. Review recommended before posting.*\n`;
  }
  
  return { passed, hardBlocks, softBlocks, report };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node quality-gate.mjs <script.json>');
    console.log('       node quality-gate.mjs data/scripts/reel-research-workflow.json');
    process.exit(1);
  }
  
  const scriptPath = path.resolve(args[0]);
  
  checkQuality(scriptPath)
    .then(result => {
      console.log(result.report);
      console.log('\n---');
      console.log(`Hard blocks: ${result.hardBlocks.length}`);
      console.log(`Soft blocks: ${result.softBlocks.length}`);
      console.log(`Passed: ${result.passed}`);
      process.exit(result.passed ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
