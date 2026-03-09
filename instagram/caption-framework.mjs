/**
 * caption-framework.mjs — Unified caption/title generation for @toolsforbuilders
 * Single source of truth for Instagram, YouTube, and TikTok content generation.
 * 
 * Imported by:
 *   - daily-crosspost.mjs
 *   - post-approved-reel.mjs
 */

// ─────────────────────────────────────────────────────────────────────────────
// HASHTAG MAPS — Single Source of Truth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool-specific hashtags. Only included if that tool is featured in the video.
 */
export const TOOL_TAGS = {
  'perplexity': '#perplexityai',
  'gemini': '#geminiapp',
  'gemini deep research': '#geminiapp',
  'claude': '#claudeai',
  'chatgpt': '#chatgpt',
  'notebooklm': '#notebooklm',
  'midjourney': '#midjourney',
  'n8n': '#n8nautomation',
  'zapier': '#zapier',
  'make': '#makeautomation',
  'runway': '#runwayml',
  'elevenlabs': '#elevenlabs',
  'gpt': '#openai',
  'openai': '#openai',
  'suno': '#sunoai',
  'kling': '#klingai',
  'descript': '#descript',
  'notion': '#notionai',
  'canva': '#canva',
  'gamma': '#gammaapp',
};

/**
 * Pillar-specific hashtags — always one per post based on content type.
 */
export const PILLAR_TAGS = {
  'Workflow': '#aiworkflow',
  'Comparison': '#aicomparison',
  'Hidden Feature': '#aihacks',
  'Time/Money Math': '#savetime',
  'Myth Bust': '#aidebunked',
};

/**
 * Pillar emoji map — used in Instagram captions.
 */
const PILLAR_EMOJI = {
  'Workflow': '⚙️',
  'Comparison': '⚖️',
  'Hidden Feature': '🔍',
  'Time/Money Math': '💰',
  'Myth Bust': '💥',
};

// Brand tag — always included last
export const BRAND_TAG = '#toolsforbuilders';

// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM TAGS — 10k–500k sweet spot for discovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tier 1: Core niche tags (always included for IG).
 */
export const TIER_1_TAGS = ['#aitools', '#solopreneur', '#aiautomation'];

/**
 * Tier 2: Topic-relevant tags per pillar (curated 10k–300k posts).
 */
export const TIER_2_BY_PILLAR = {
  'Workflow':        ['#workflowautomation', '#digitalnomadlife', '#buildingpublicly'],
  'Comparison':      ['#onlinebusiness', '#creatoreconomy', '#growthhacking'],
  'Hidden Feature':  ['#contentcreator', '#growthhacking', '#buildingpublicly'],
  'Time/Money Math': ['#sidehustle', '#passiveincome', '#onlinebusiness'],
  'Myth Bust':       ['#entrepreneurmindset', '#growthhacking', '#contentcreator'],
  'default':         ['#onlinebusiness', '#contentcreator', '#workflowautomation'],
};

// ─────────────────────────────────────────────────────────────────────────────
// TIKTOK TAGS — Different discovery mechanics, max 5 tags
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TikTok-specific core tags — do NOT share with Instagram's tier 2.
 */
export const TIKTOK_CORE_TAGS = ['#LearnOnTikTok', '#TikTokTips'];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract unique tool names from script points.
 */
function extractToolNames(script) {
  if (!script?.points) return [];
  return [...new Set(script.points.map(p => p.toolName).filter(Boolean))];
}

/**
 * Get tool-specific hashtags for the given tools.
 */
function getToolTags(toolNames) {
  return toolNames
    .map(t => TOOL_TAGS[t.toLowerCase()] || null)
    .filter(Boolean);
}

/**
 * Build Instagram hashtags (9–12 tags).
 * Priority: pillar → tool-specific → tier1 → tier2 → brand
 */
function buildInstagramTags(script, max = 12) {
  if (!script) return [...TIER_1_TAGS, BRAND_TAG].slice(0, max);

  const toolNames = extractToolNames(script);
  const toolTags = getToolTags(toolNames);
  const pillarTag = PILLAR_TAGS[script.pillar] || '#aiworkflow';
  const tier2 = TIER_2_BY_PILLAR[script.pillar] || TIER_2_BY_PILLAR['default'];

  return [...new Set([pillarTag, ...toolTags, ...TIER_1_TAGS, ...tier2, BRAND_TAG])].slice(0, max);
}

/**
 * Build TikTok hashtags (max 5).
 * Different pool than IG: LearnOnTikTok, TikTokTips, pillar, tool, brand
 */
function buildTikTokTags(script, max = 5) {
  if (!script) return [...TIKTOK_CORE_TAGS, BRAND_TAG].slice(0, max);

  const toolNames = extractToolNames(script);
  const toolTags = getToolTags(toolNames).slice(0, 1); // Max 1 tool tag
  const pillarTag = PILLAR_TAGS[script.pillar] || '#aiworkflow';

  // Order: LearnOnTikTok, TikTokTips, pillar, tool (if any), brand
  return [...new Set([...TIKTOK_CORE_TAGS, pillarTag, ...toolTags, BRAND_TAG])].slice(0, max);
}

/**
 * Build YouTube hashtags (3–5, first 3 appear above video title).
 * Order: tool-specific → pillar → brand
 */
function buildYouTubeTags(script, max = 5) {
  if (!script) return [BRAND_TAG, '#aitools', '#solopreneur'].slice(0, max);

  const toolNames = extractToolNames(script);
  const toolTags = getToolTags(toolNames).slice(0, 2); // Max 2 tool tags
  const pillarTag = PILLAR_TAGS[script.pillar] || '#aiworkflow';

  // Order: tool-specific first (appears above title), then pillar, then brand
  return [...new Set([...toolTags, pillarTag, BRAND_TAG, '#aitools'])].slice(0, max);
}

/**
 * Build YouTube backend tags (not visible, help internal categorization).
 */
function buildYouTubeBackendTags(script) {
  const base = ['AI tools', 'solopreneur', 'productivity', 'workflow', 'AI workflow'];
  if (!script) return base;

  const pillar = script.pillar ? [script.pillar] : [];
  const tools = extractToolNames(script);

  return [...base, ...pillar, ...tools];
}

/**
 * Truncate text to maxLength, ending at word boundary with ellipsis.
 */
function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength - 1);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM-SPECIFIC GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate Instagram caption.
 * Format: {emoji} {topic}\n{tool chain}\n\nSave this. Follow @toolsforbuilders...\n\n{hashtags}
 */
export function generateInstagramCaption(script) {
  if (!script) {
    return `🛠️ Daily AI Workflow\n\nFollow @toolsforbuilders for one practical AI workflow every day.\n\n${[...TIER_1_TAGS, BRAND_TAG].join(' ')}`;
  }

  const emoji = PILLAR_EMOJI[script.pillar] || '🛠️';
  const toolNames = extractToolNames(script);
  const toolLine = toolNames.length ? `\n${toolNames.join(' → ')}` : '';
  const tags = buildInstagramTags(script, 12);

  return `${emoji} ${script.topic}${toolLine}\n\nSave this. Follow @toolsforbuilders for one workflow every day.\n\n${tags.join(' ')}`;
}

/**
 * Generate YouTube content (title, description, backend tags).
 * 
 * Title formats:
 *   - 1 tool: "NotebookLM: Turn Research Into Passive Listening | AI Tools for Solopreneurs #Shorts"
 *   - 2 tools: "Perplexity vs Claude — Which Is Worth It? | AI Tools #Shorts"
 *   - No tool: "{topic shortened} | AI Tools for Solopreneurs #Shorts"
 * 
 * Description: SEO-keyword-rich, 2-3 sentences, not just topic line
 */
export function generateYouTubeContent(script) {
  if (!script) {
    return {
      title: 'AI Workflow for Solopreneurs #Shorts',
      description: `Discover AI tools and workflows that save time and boost productivity.\n\nSubscribe for one AI workflow every day → @toolsforbuilders\n\n${[BRAND_TAG, '#aitools', '#solopreneur'].join(' ')}`,
      backendTags: buildYouTubeBackendTags(null),
    };
  }

  const tools = extractToolNames(script);
  const hashtags = buildYouTubeTags(script, 5);
  const backendTags = buildYouTubeBackendTags(script);

  // ─── TITLE ───────────────────────────────────────────────────────────────
  let title;
  const suffix = ' #Shorts';
  const maxTitleLength = 100;

  if (tools.length === 0) {
    // No tools: truncate topic
    const topicMax = maxTitleLength - ' | AI Tools for Solopreneurs'.length - suffix.length;
    const shortTopic = truncateAtWord(script.topic, topicMax);
    title = `${shortTopic} | AI Tools for Solopreneurs${suffix}`;
  } else if (tools.length === 1) {
    // Single tool: "Tool: action/insight | AI Tools for Solopreneurs #Shorts"
    const tool = tools[0];
    const actionMax = maxTitleLength - `${tool}: `.length - ' | AI Tools for Solopreneurs'.length - suffix.length;
    const action = truncateAtWord(script.topic.replace(new RegExp(tool, 'gi'), '').trim(), actionMax);
    title = `${tool}: ${action} | AI Tools for Solopreneurs${suffix}`;
  } else {
    // Multiple tools: "Tool1 vs Tool2 — insight | AI Tools #Shorts"
    const vsString = `${tools[0]} vs ${tools[1]}`;
    const insightMax = maxTitleLength - vsString.length - ' — '.length - ' | AI Tools'.length - suffix.length;
    // Extract a short insight from topic
    const insight = truncateAtWord(script.hookHeadline || 'Which Is Worth It?', insightMax);
    title = `${vsString} — ${insight} | AI Tools${suffix}`;
  }

  // Ensure title doesn't exceed 100 chars
  if (title.length > maxTitleLength) {
    title = title.slice(0, maxTitleLength - 1) + '…';
  }

  // ─── DESCRIPTION ─────────────────────────────────────────────────────────
  // SEO-keyword-rich: 2-3 sentences with tool names, use case, keywords
  let descParagraph;
  
  if (tools.length === 0) {
    descParagraph = `Learn how to ${script.topic.toLowerCase()}. This quick AI workflow shows you exactly how to save time and boost productivity as a solopreneur.`;
  } else if (tools.length === 1) {
    descParagraph = `Learn how to use ${tools[0]} to ${script.topic.toLowerCase().replace(new RegExp(tools[0], 'gi'), '').trim()}. This free AI tool workflow is perfect for solopreneurs looking to automate and save time.`;
  } else {
    descParagraph = `Comparing ${tools.join(' and ')} — which one is better for ${script.pillar === 'Comparison' ? 'your workflow' : script.topic.toLowerCase()}? This side-by-side breakdown helps solopreneurs pick the right AI tool.`;
  }

  const toolsCovered = tools.length > 0 ? `\n\nTools covered: ${tools.join(', ')}` : '';
  
  const description = `${descParagraph}${toolsCovered}\n\nSubscribe for one AI workflow every day → @toolsforbuilders\n\n${hashtags.join(' ')}`;

  return { title, description, backendTags };
}

/**
 * Generate TikTok caption.
 * Format:
 *   Line 1: First sentence of hookTTS (scroll-stopper)
 *   Line 2: Tools: tool1 → tool2
 *   CTA: Save this 👇 Follow @toolsforbuilders...
 *   Hashtags: max 5, TikTok-specific pool
 */
export function generateTikTokCaption(script) {
  if (!script) {
    return `🛠️ AI workflow for solopreneurs\n\nSave this 👇 Follow @toolsforbuilders for one AI tip every day.\n\n${[...TIKTOK_CORE_TAGS, BRAND_TAG].slice(0, 5).join(' ')}`;
  }

  // Line 1: First sentence of hookTTS (scroll-stopper)
  const hookLine = script.hookTTS
    ? script.hookTTS.split('.')[0].trim()
    : script.topic;

  // Line 2: Tool chain
  const tools = extractToolNames(script);
  const toolLine = tools.length ? `\nTools: ${tools.join(' → ')}` : '';

  // TikTok-specific tags (max 5)
  const tags = buildTikTokTags(script, 5);

  return `${hookLine}${toolLine}\n\nSave this 👇 Follow @toolsforbuilders for one AI tip every day.\n\n${tags.join(' ')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate platform-optimized content for all three platforms.
 * 
 * @param {object|null} script - Content queue script object
 * @returns {{
 *   instagram: { caption: string },
 *   youtube: { title: string, description: string, backendTags: string[] },
 *   tiktok: { caption: string }
 * }}
 */
export function generatePlatformContent(script) {
  return {
    instagram: {
      caption: generateInstagramCaption(script),
    },
    youtube: generateYouTubeContent(script),
    tiktok: {
      caption: generateTikTokCaption(script),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY EXPORTS — For backward compatibility during migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build tags for any platform (legacy helper, internal use).
 * @deprecated Use platform-specific tag builders instead.
 */
export function buildTags(script, max = 12) {
  return buildInstagramTags(script, max);
}
