#!/usr/bin/env node
/**
 * rss-monitor.mjs — RSS feed monitor for @btcmaxistheway
 * 
 * Polls RSS feeds every 15 minutes, scores new items, and enters approval flow
 * for post-worthy Bitcoin news. Shares dedup store with reactive-monitor.mjs.
 * 
 * Usage:
 *   node rss-monitor.mjs           # Full run
 *   node rss-monitor.mjs --dry-run # Test without posting/notifying
 *   node rss-monitor.mjs --init    # Initialize state (mark all current items as seen)
 */

import crypto from 'crypto';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const INIT_MODE = process.argv.includes('--init');

// === CONFIGURATION ===
const CONFIG = {
  telegramBotToken: null,
  anthropicApiKey: null,
  twitter: null,
};

const PATHS = {
  openclawConfig: '/root/.openclaw/openclaw.json',
  authProfiles: '/root/.openclaw/agents/main/agent/auth-profiles.json',
  envSecrets: '/root/.openclaw/workspace/.env.secrets',
  dedupStore: '/root/.openclaw/workspace/memory/reactive-posted.json',
  approvalState: '/root/.openclaw/workspace/memory/reactive-approval-state.json',
  rssState: '/root/.openclaw/workspace/memory/rss-last-seen.json',
  logFile: '/root/.openclaw/workspace/memory/rss-monitor.log',
  writingRules: '/root/.openclaw/workspace/memory/writing-rules.md',
  cardScript: '/root/.openclaw/workspace/scripts/twitter/generate-card.mjs',
};

const TELEGRAM = {
  chatId: '-1003879867373',
  messageThreadId: 6,
};

// === RSS FEEDS ===
const RSS_FEEDS = [
  // Bitcoin/Crypto primary
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss', authority: 20 },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed', authority: 20 },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml', authority: 20 },
  { name: 'Decrypt', url: 'https://decrypt.co/feed', authority: 15 },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', authority: 15 },
  { name: 'Blockworks', url: 'https://blockworks.co/feed', authority: 15 },
  // Macro/Finance
  { name: 'Financial Times', url: 'https://www.ft.com/?format=rss', authority: 25 },
];

// === SCORING CONFIGURATION ===
const SCORING = {
  APPROVAL_EXPIRY_HOURS: 2,
  MIN_SCORE: 70,  // Minimum score to enter approval flow (raised — angle gate now requires score >= 11/20)
};

// Blocked domains (content farms, noise sources) - same as reactive-monitor
const BLOCKED_DOMAINS = [
  'newsbtc.com', 'u.today', 'cryptopotato.com', 'beincrypto.com',
  'ambcrypto.com', 'coingape.com', 'cryptonews.com', 'dailyhodl.com',
  'cryptobriefing.com', 'zycrypto.com', 'bitcoinist.com', 'fxstreet.com',
  'investing.com', 'finbold.com', 'cryptoslate.com',
];

// Content patterns to reject (applied to title + description)
const BLOCKED_PATTERNS = [
  /price.{0,20}prediction/i,
  /could reach \$[\d,]+/i,
  /will hit \$[\d,]+/i,
  /analyst.*says/i,
  /experts? (say|predict|believe)/i,
  /technical analysis/i,
  /\bRSI\b|\bMACD\b/i,
  /support.{0,10}resistance/i,
  /bull.{0,10}bear.{0,10}pattern/i,
  /sponsored|promoted|advertisement/i,
  /\d+x.{0,10}return/i,
  /moon|mooning|to the moon/i,
  /next bitcoin|next crypto/i,
  /is bitcoin going to/i,
  /5 reasons why|10 things/i,
  /you won't believe/i,
];

// === CATEGORIES (same as reactive-monitor.mjs v3.1) ===
const CATEGORIES = [
  {
    id: 'exchange_failure',
    name: 'Exchange hack/insolvency/withdrawal freeze',
    threshold: 60,
    autoThreshold: 85,
    keywords: ['hack', 'breach', 'insolvency', 'bankrupt', 'freeze', 'suspended', 'stolen', 'missing', 'collapse', 'hacked'],
    negativeKeywords: ['opinion', 'analysis', 'could', 'might', 'rumor', 'if', 'prediction'],
    impactGuide: '>$100M: 20-25, $10M-$100M: 10-19, <$10M: 0-9',
    angleHint: 'Not your keys, not your coins. Custody risk. Trust dependencies.',
  },
  {
    id: 'regulatory_action',
    name: 'Regulatory action against Bitcoin or self-custody',
    threshold: 65,
    autoThreshold: 90,
    keywords: ['SEC', 'CFTC', 'lawsuit', 'enforcement', 'ban', 'ruling', 'fine', 'enacted', 'passed', 'regulation'],
    negativeKeywords: ['proposed', 'considering', 'might', 'could', 'opinion', 'analysis', 'if passed'],
    impactGuide: 'US federal ruling: 20-25, US state/EU: 10-19, other: 0-9',
    angleHint: 'Sovereignty under attack. If they ban it, it was working.',
  },
  {
    id: 'institutional_bitcoin',
    name: 'Major bank/institution Bitcoin custody or treasury',
    threshold: 75,
    autoThreshold: 95,
    keywords: ['custody', 'treasury', 'purchase', 'bought', 'acquire', 'holding', 'announce', 'billion', 'corporate'],
    negativeKeywords: ['rumor', 'considering', 'might', 'could', 'speculation', 'small', 'startup', 'report'],
    impactGuide: '$1B+ or Fortune 100: 20-25, $100M-$1B: 10-19, <$100M: skip',
    angleHint: 'Historical arc: what they said before vs now. Capitulation narrative.',
  },
  {
    id: 'government_seizure',
    name: 'Government seizure of Bitcoin',
    threshold: 60,
    autoThreshold: 85,
    keywords: ['seized', 'confiscate', 'forfeit', 'DOJ', 'FBI', 'arrest', 'seize', 'seizure'],
    negativeKeywords: ['years ago', 'historic', 'old case', 'opinion'],
    impactGuide: '>$500M: 20-25, $50M-$500M: 10-19, <$50M: 0-9',
    angleHint: 'Custody matters. Government can seize from exchanges, not from self-custody.',
  },
  {
    id: 'central_bank_emergency',
    name: 'Central bank emergency policy',
    threshold: 70,
    autoThreshold: 90,
    keywords: ['emergency', 'rate cut', 'QE', 'quantitative easing', 'bailout', 'intervention', 'crisis', 'federal reserve', 'ECB'],
    negativeKeywords: ['expected', 'forecast', 'prediction', 'unchanged', 'as anticipated', 'gradual', 'routine'],
    impactGuide: 'Fed/ECB/BOJ emergency: 20-25, other central bank: 10-19, routine: skip',
    angleHint: 'Fiat fragility. Emergency = admission.',
  },
  {
    id: 'currency_crisis',
    name: 'Currency devaluation/capital controls/hyperinflation',
    threshold: 55,
    autoThreshold: 80,
    keywords: ['devaluation', 'collapse', 'capital controls', 'hyperinflation', 'freeze', 'shortage', 'crisis', 'crash', 'peso', 'lira', 'naira'],
    negativeKeywords: ['forecast', 'prediction', 'could', 'might', 'historical', 'years ago', 'opinion'],
    impactGuide: 'G20 economy: 20-25, mid-size economy: 10-19, small economy: 5-9',
    angleHint: 'This is why Bitcoin exists. Sovereignty. Escape from state monetary control.',
  },
  {
    id: 'nation_state_adoption',
    name: 'Country adopts Bitcoin (legal tender/reserves)',
    threshold: 50,
    autoThreshold: 75,
    keywords: ['legal tender', 'strategic reserve', 'sovereign', 'nation', 'country', 'central bank', 'government', 'national'],
    negativeKeywords: ['proposed', 'considering', 'rumor', 'might', 'could', 'speculation', 'debate'],
    impactGuide: 'Legal tender: 25, strategic reserve: 20-24, considering (if official): 10-19',
    angleHint: 'Structural significance. Game theory. First mover advantages.',
  },
  {
    id: 'self_custody_news',
    name: 'Self-custody security/regulation news',
    threshold: 65,
    autoThreshold: 90,
    keywords: ['vulnerability', 'security', 'flaw', 'breach', 'self-custody', 'hardware wallet', 'cold storage', 'ledger', 'trezor'],
    negativeKeywords: ['review', 'comparison', 'best', 'guide', 'tutorial', 'how to', 'setup'],
    impactGuide: 'Critical vulnerability: 20-25, custody provider failure: 15-20, minor issue: 5-14',
    angleHint: 'Core brand. Self-custody education.',
  },
  {
    id: 'mining_events',
    name: 'Major mining events',
    threshold: 75,
    autoThreshold: 95,
    conditional: true,
    keywords: ['mining ban', 'hashrate', 'crash', 'bankruptcy', 'shutdown', 'illegal', 'miner'],
    negativeKeywords: ['opinion', 'analysis', 'minor', 'small', 'difficulty adjustment', 'normal'],
    impactGuide: 'China-level ban: 20-25, major miner failure: 15-20, hashrate drop >25%: 10-19',
    angleHint: 'Proof of work. Antifragility. Network survived worse.',
  },
  {
    id: 'protocol_development',
    name: 'Bitcoin protocol milestones',
    threshold: 80,
    autoThreshold: 100,
    conditional: true,
    keywords: ['activated', 'upgrade', 'milestone', 'soft fork', 'lightning', 'taproot'],
    negativeKeywords: ['proposed', 'debate', 'BIP', 'discussion', 'review', 'testing'],
    impactGuide: 'Consensus upgrade activated: 20-25, Lightning milestone: 15-20',
    angleHint: 'Decentralized upgrades. No permission needed.',
  },
  {
    id: 'institutional_first_adoption',
    name: 'First-time institutional Bitcoin adoption',
    threshold: 70,
    autoThreshold: 90,
    keywords: ['pension', 'insurance', 'endowment', 'foundation', 'family office', 'first', 'announces', 'allocates', 'treasury', 'allocation'],
    negativeKeywords: ['MicroStrategy', 'Strategy', 'considering', 'might', 'could', 'rumor', 'speculation', 'adds more', 'increases', 'additional'],
    impactGuide: 'First of a category: 20-25, First of sub-type: 15-19, Repeat buyer: skip',
    angleHint: 'When a pension fund holds Bitcoin, it has accepted the alternative is slow guaranteed loss.',
  },
  {
    id: 'government_perception_shift',
    name: 'Nation/government perception shift on Bitcoin',
    threshold: 65,
    autoThreshold: 88,
    keywords: ['central bank', 'parliament', 'congress', 'committee', 'hearing', 'minister', 'president', 'research', 'study', 'report', 'framework', 'position', 'statement', 'policy'],
    negativeKeywords: ['unchanged', 'reaffirms', 'continues', 'routine', 'minor', 'local', 'opinion piece', 'analyst'],
    impactGuide: 'Central bank research paper: 20-25, Parliamentary hearing: 18-22, Regulatory proposal: 12-18',
    angleHint: 'Track the arc of legitimization. Even hostility reveals something.',
  },
];

// === LOGGING ===
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(PATHS.logFile, line + '\n');
  } catch (e) { /* ignore */ }
}

// === LOG ROTATION ===
function rotateLogs() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const archiveDir = '/root/.openclaw/workspace/memory/archive';
  const LOG_SIZE_LIMIT = 50 * 1024; // 50KB

  // Ensure archive dir exists
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const logsToCheck = [
    { src: PATHS.logFile, archiveName: `rss-${today}.log` },
    { src: '/root/.openclaw/workspace/memory/reactive-monitor.log', archiveName: `reactive-${today}.log` },
  ];

  for (const { src, archiveName } of logsToCheck) {
    if (!fs.existsSync(src)) continue;
    try {
      const stat = fs.statSync(src);
      if (stat.size > LOG_SIZE_LIMIT) {
        const dest = `${archiveDir}/${archiveName}`;
        fs.renameSync(src, dest);
        fs.writeFileSync(src, ''); // create fresh empty log
        console.log(`[LOG ROTATION] ${src} (${Math.round(stat.size / 1024)}KB) archived to ${dest}`);
      }
    } catch (e) {
      console.log(`[LOG ROTATION] Failed for ${src}: ${e.message}`);
    }
  }
}

// === CONFIG LOADING ===
function loadConfig() {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(PATHS.openclawConfig, 'utf8'));
    CONFIG.telegramBotToken = ocConfig.channels?.telegram?.botToken;
  } catch (e) {
    throw new Error(`Failed to load openclaw.json: ${e.message}`);
  }

  try {
    const authProfiles = JSON.parse(fs.readFileSync(PATHS.authProfiles, 'utf8'));
    CONFIG.anthropicApiKey = authProfiles.profiles?.['anthropic:default']?.token;
  } catch (e) {
    throw new Error(`Failed to load auth-profiles.json: ${e.message}`);
  }

  try {
    const lines = fs.readFileSync(PATHS.envSecrets, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
    CONFIG.twitter = {
      apiKey: env.TWITTER_API_KEY,
      apiSecret: env.TWITTER_API_SECRET,
      accessToken: env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: env.TWITTER_ACCESS_TOKEN_SECRET,
    };
  } catch (e) {
    throw new Error(`Failed to load .env.secrets: ${e.message}`);
  }

  if (!CONFIG.telegramBotToken) throw new Error('Missing Telegram bot token');
  if (!CONFIG.anthropicApiKey) throw new Error('Missing Anthropic API key');
  if (!CONFIG.twitter?.apiKey) throw new Error('Missing Twitter credentials');
}

// === RSS STATE MANAGEMENT ===
function loadRssState() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.rssState, 'utf8'));
  } catch (e) {
    const defaultState = {
      lastChecked: null,
      seenGuids: [],
      feedErrors: {},
    };
    saveRssState(defaultState);
    return defaultState;
  }
}

function saveRssState(state) {
  // Keep only last 500 GUIDs
  if (state.seenGuids.length > 500) {
    state.seenGuids = state.seenGuids.slice(-500);
  }
  fs.writeFileSync(PATHS.rssState, JSON.stringify(state, null, 2));
}

// === APPROVAL STATE MANAGEMENT (from reactive-monitor) ===
function loadApprovalState() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.approvalState, 'utf8'));
  } catch (e) {
    return { mode: 'approval', postsApproved: 0, postsRejected: 0, approvalThreshold: 10, pendingApprovals: [] };
  }
}

function saveApprovalState(state) {
  fs.writeFileSync(PATHS.approvalState, JSON.stringify(state, null, 2));
}

function cleanExpiredApprovals(state) {
  const now = Date.now();
  state.pendingApprovals = state.pendingApprovals.filter(p => {
    const expiry = new Date(p.expiresAt).getTime();
    return expiry > now;
  });
  return state;
}

function addPendingApproval(state, approval) {
  state.pendingApprovals.push(approval);
  saveApprovalState(state);
}

// === HTTP HELPERS ===
function httpsRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      port: parsed.port || (isHttps ? 443 : 80),
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    
    if (body && !Buffer.isBuffer(body)) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      body = bodyStr;
    } else if (Buffer.isBuffer(body)) {
      opts.headers['Content-Length'] = body.length;
    }

    const req = client.request(opts, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).href;
        resolve(httpsRequest(newUrl, options, body));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function buildMultipartFormData(fields, files) {
  const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');
  const parts = [];
  
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }
  
  for (const { fieldName, filename, contentType, buffer } of files) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
    parts.push(buffer);
    parts.push('\r\n');
  }
  
  parts.push(`--${boundary}--\r\n`);
  
  const bufferParts = parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p, 'utf8'));
  return { boundary, body: Buffer.concat(bufferParts) };
}

// === RSS PARSING ===
function parseRssXml(xml) {
  const items = [];
  
  // Try RSS 2.0 format
  const rssItemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const match of rssItemMatches) {
    const itemXml = match[1];
    const item = {
      title: extractTag(itemXml, 'title'),
      link: extractTag(itemXml, 'link'),
      description: extractTag(itemXml, 'description'),
      pubDate: extractTag(itemXml, 'pubDate'),
      guid: extractTag(itemXml, 'guid') || extractTag(itemXml, 'link'),
    };
    if (item.title && item.link) {
      items.push(item);
    }
  }
  
  // Try Atom format if no RSS items found
  if (items.length === 0) {
    const atomEntryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi);
    for (const match of atomEntryMatches) {
      const entryXml = match[1];
      const linkMatch = entryXml.match(/<link[^>]*href="([^"]+)"/);
      const item = {
        title: extractTag(entryXml, 'title'),
        link: linkMatch ? linkMatch[1] : null,
        description: extractTag(entryXml, 'summary') || extractTag(entryXml, 'content'),
        pubDate: extractTag(entryXml, 'updated') || extractTag(entryXml, 'published'),
        guid: extractTag(entryXml, 'id') || (linkMatch ? linkMatch[1] : null),
      };
      if (item.title && item.link) {
        items.push(item);
      }
    }
  }
  
  return items;
}

function extractTag(xml, tagName) {
  // Try CDATA first
  const cdataMatch = xml.match(new RegExp(`<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`, 'i'));
  if (cdataMatch) {
    return decodeHtmlEntities(cdataMatch[1].trim());
  }
  
  // Try regular tag
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'));
  if (match) {
    return decodeHtmlEntities(match[1].trim());
  }
  
  return null;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ''); // Strip remaining HTML tags
}

// === FEED FETCHING ===
async function fetchFeed(feed) {
  try {
    const result = await httpsRequest(feed.url, {
      method: 'GET',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; OpenClaw RSS Monitor)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    
    if (result.status !== 200) {
      return { feed, error: `HTTP ${result.status}`, items: [] };
    }
    
    const items = parseRssXml(result.body);
    return { feed, items, error: null };
  } catch (e) {
    return { feed, error: e.message, items: [] };
  }
}

// === DEDUPLICATION (shared with reactive-monitor) ===
function loadDedupStore() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.dedupStore, 'utf8'));
  } catch (e) {
    return { stories: [] };
  }
}

function saveDedupStore(store) {
  if (store.stories.length > 100) {
    store.stories = store.stories.slice(-100);
  }
  fs.writeFileSync(PATHS.dedupStore, JSON.stringify(store, null, 2));
}

function hashUrl(url) {
  const normalized = url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function isAlreadyPosted(store, url) {
  const hash = hashUrl(url);
  return store.stories.some(s => s.id === hash);
}

function normalizeHeadline(headline) {
  return headline.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function isSimilarStoryPosted(store, headline, hours = 24) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const words = new Set(normalizeHeadline(headline));
  
  for (const story of store.stories) {
    if (new Date(story.postedAt).getTime() < cutoff) continue;
    const storyWords = new Set(normalizeHeadline(story.headline));
    const overlap = [...words].filter(w => storyWords.has(w)).length;
    if (overlap / words.size > 0.5) return true;
  }
  return false;
}

// === CONTENT FILTERING ===
function isBlockedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return BLOCKED_DOMAINS.some(domain => hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

function matchesBlockedPattern(text) {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(text));
}

// === CATEGORY MATCHING ===
function matchCategory(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  
  for (const category of CATEGORIES) {
    const hasKeyword = category.keywords.some(kw => text.includes(kw.toLowerCase()));
    if (!hasKeyword) continue;
    
    const hasNegative = category.negativeKeywords.some(kw => text.includes(kw.toLowerCase()));
    if (hasNegative) continue;
    
    return category;
  }
  
  return null;
}

// === RECENCY CHECK ===
function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr);
  } catch (e) {
    return null;
  }
}

function isRecent(dateStr, maxHours = 6) {
  const date = parseDate(dateStr);
  if (!date) return true; // Assume recent if unparseable
  const ageMs = Date.now() - date.getTime();
  return ageMs < maxHours * 60 * 60 * 1000;
}

// === SCORING ===
function scoreRecency(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return { score: 15, note: 'no timestamp, assumed recent' };
  
  const ageMs = Date.now() - date.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  
  if (ageHours < 1) return { score: 25, note: '<1h old' };
  if (ageHours < 3) return { score: 20, note: '1-3h old' };
  if (ageHours < 6) return { score: 10, note: '3-6h old' };
  return { score: 0, note: `>6h old (${Math.round(ageHours)}h), discard` };
}

function scoreSourceAuthority(feedAuthority) {
  return { score: feedAuthority, note: `feed authority: ${feedAuthority}` };
}

function scoreConfirmationCount(sourceCount) {
  if (sourceCount >= 4) return { score: 25, note: `${sourceCount} sources` };
  if (sourceCount === 3) return { score: 20, note: '3 sources' };
  if (sourceCount === 2) return { score: 15, note: '2 sources' };
  return { score: 10, note: '1 source' };
}

async function scoreImpactMagnitude(headline, description, category) {
  const prompt = `Rate the Bitcoin/financial impact of this news from 0 to 25.

NEWS:
Headline: ${headline}
Description: ${description || 'N/A'}
Category: ${category.name}

IMPACT GUIDE FOR THIS CATEGORY:
${category.impactGuide}

Respond with ONLY: "NUMBER: brief reason (max 10 words)"`;

  try {
    const result = await httpsRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CONFIG.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }, {
      model: 'claude-haiku-4-5-20250514',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    });
    
    if (result.status !== 200) {
      return { score: 10, note: 'API error, default score' };
    }
    
    const text = result.body.content?.[0]?.text?.trim() || '';
    const match = text.match(/^(\d+):?\s*(.*)$/);
    if (match) {
      const score = Math.min(25, Math.max(0, parseInt(match[1], 10)));
      return { score, note: match[2] || 'assessed' };
    }
    
    return { score: 10, note: 'parse error, default' };
  } catch (e) {
    return { score: 10, note: 'exception, default' };
  }
}

async function scoreAngleQuality(headline, description, category) {
  const prompt = `Rate the Bitcoin angle quality for @btcmaxistheway to comment on this news (0-20).

NEWS:
Headline: ${headline}
Description: ${description || 'N/A'}
Category: ${category.name}

ACCOUNT VOICE:
- Philosophical, structural analysis (not price-focused)
- Core themes: self-custody, sovereignty, proof of work, trustlessness
- Tone: calm, analytical, dry sarcasm when earned
- Avoids: generic takes everyone tweets, price pumping, hype

STRICT SCORING RULES:
- 16-20: The story directly involves Bitcoin, monetary sovereignty, institutional Bitcoin adoption, or self-custody. The connection is OBVIOUS and the account has something sharp and unique to say. No logical leaps required.
- 11-15: The story has a clear one-step connection to Bitcoin's core thesis (e.g. currency debasement, institutional trust failure, energy/geopolitics). The angle is natural, not forced.
- 6-10: The connection to Bitcoin requires two or more logical steps, or the angle is generic ("this is why Bitcoin matters"). Reject these — the tweet will be weak.
- 0-5: No genuine Bitcoin connection. The story is about geopolitics, courts, AI, tech, or finance with no direct relevance to Bitcoin's core thesis. Reject.

HARD RULES — score 0-5 if ANY of these apply:
- The only Bitcoin connection is "this shows why hard money matters" or similar generic framing
- The story is about stablecoins, altcoins, or crypto that isn't Bitcoin
- The story requires assuming Bitcoin is relevant because fiat is bad (lazy reasoning)
- The story is about military, courts, AI regulation, or corporate news with no Bitcoin angle

Respond with ONLY: "SCORE: [number] | ANGLE: [one sentence angle, or 'none' if score <11]"`;

  try {
    const result = await httpsRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CONFIG.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }, {
      model: 'claude-haiku-4-5-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });
    
    if (result.status !== 200) {
      return { score: 10, note: 'API error, default', angle: null };
    }
    
    const text = result.body.content?.[0]?.text?.trim() || '';
    const match = text.match(/SCORE:\s*(\d+)\s*\|\s*ANGLE:\s*(.+)/i);
    if (match) {
      const score = Math.min(20, Math.max(0, parseInt(match[1], 10)));
      const angle = match[2].toLowerCase() === 'none' ? null : match[2];
      return { score, note: 'angle quality', angle };
    }
    
    return { score: 10, note: 'parse error, default', angle: null };
  } catch (e) {
    return { score: 10, note: 'exception, default', angle: null };
  }
}

async function calculateScore(story) {
  const recency = scoreRecency(story.pubDate);
  const authority = scoreSourceAuthority(story.feedAuthority);
  const confirmation = scoreConfirmationCount(story.sourceCount);
  
  // Early exit if too old
  if (recency.score === 0) {
    return {
      total: 0,
      breakdown: { recency, authority, confirmation, impact: { score: 0, note: 'skipped' }, angle: { score: 0, note: 'skipped' } },
      discard: true,
      discardReason: recency.note,
    };
  }
  
  // Get impact and angle scores
  const impact = await scoreImpactMagnitude(story.headline, story.description, story.category);
  const angle = await scoreAngleQuality(story.headline, story.description, story.category);
  
  if (angle.score < 11) {
    return {
      total: 0,
      breakdown: { recency, authority, confirmation, impact, angle },
      discard: true,
      discardReason: `Low angle quality (${angle.score}/20) — no genuine Bitcoin connection`,
    };
  }
  
  const total = recency.score + authority.score + confirmation.score + impact.score + angle.score;
  
  return {
    total,
    breakdown: { recency, authority, confirmation, impact, angle },
    discard: false,
    suggestedAngle: angle.angle,
  };
}

// === DRAFT GENERATION ===
async function generateDraft(story, suggestedAngle = null) {
  let writingRules = '';
  try {
    writingRules = fs.readFileSync(PATHS.writingRules, 'utf8').slice(0, 8000);
  } catch (e) {
    writingRules = 'Be calm, analytical, direct. No hype. No hashtags. No dashes.';
  }
  
  const angleGuidance = suggestedAngle 
    ? `SUGGESTED ANGLE (use as inspiration): ${suggestedAngle}`
    : `ANGLE HINT: ${story.category.angleHint}`;

  const prompt = `You are writing a reactive tweet for @btcmaxistheway about breaking Bitcoin news.

NEWS:
Headline: ${story.headline}
Description: ${story.description || 'N/A'}
Category: ${story.category.name}
Source: ${story.sourceUrl}

${angleGuidance}

VOICE RULES (follow exactly):
${writingRules}

CRITICAL CONSTRAINTS:
1. NO DASHES of any kind (no em-dashes —, no en-dashes –, no hyphens as separators)
2. Do NOT start with "I"
3. NO hashtags
4. ABSOLUTE HARD LIMIT: 240 characters maximum for your entire response. This is not a guideline. Count every single character. Aim for 200 or fewer — shorter is almost always better. Cut adjectives. Cut the second sentence if one sentence does the job. If your draft exceeds 240 chars, cut ruthlessly until it fits.
5. Be calm and analytical, not hype
6. Add your unique angle, don't just report the news
7. Do NOT include any URL — the URL will be added automatically after your text
8. BANNED PHRASES — never use these, they are clichés that signal template thinking:
   - "When a pension fund holds Bitcoin..."
   - "pension funds have made their calculation"
   - Any opener that uses an institution's behavior as a proxy for the Bitcoin argument
9. LEAD WITH THE SHARPEST LINE: Your strongest insight must be the FIRST sentence. If you write a punchy closer, move it to the opener instead.
10. DIRECT CONNECTION ONLY: The Bitcoin angle must be reachable in ONE logical step from the news. If it requires two or more leaps, don't force it.

Write ONLY the tweet body text. No URL. No commentary. No explanation. Just the tweet.`;

  try {
    const result = await httpsRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CONFIG.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    
    if (result.status !== 200) {
      log(`ERROR: Anthropic API returned ${result.status}`);
      return null;
    }
    
    const body = result.body.content?.[0]?.text?.trim();
    // Append URL programmatically — Claude should NOT include it
    const text = body + '\n' + story.sourceUrl;
    return { text, body, sourceUrl: story.sourceUrl, sourceHeadline: story.headline };
  } catch (e) {
    log(`ERROR: Draft generation failed: ${e.message}`);
    return null;
  }
}

// === QUALITY GATE ===
function qualityGate(draft) {
  const text = draft.text;
  const body = draft.body || text.replace(/\nhttps?:\/\/\S+$/, '').trim();
  const issues = [];
  
  if (text.includes('—') || text.includes('–') || / - /.test(text)) {
    issues.push('Contains dashes');
  }
  
  if (/^I[^a-z]/i.test(text.trim()) && text.trim()[0] === 'I') {
    issues.push('Starts with "I"');
  }
  
  if (/#\w+/.test(text)) {
    issues.push('Contains hashtags');
  }
  
  // Check body length (URL appended separately, counts as 23 chars on Twitter)
  // Body + newline + t.co URL (23) must be under 275 total. Max body = 250 gives ~274 total.
  if (body.length > 250) {
    issues.push(`Body too long (${body.length} chars, limit 250)`);
  }
  // Also check full Twitter-aware length as a safety net
  const twitterLength = text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
  if (twitterLength > 275) {
    issues.push(`Full tweet too long (${twitterLength} Twitter chars)`);
  }
  
  const aiTells = ['revolutionary', 'game-changing', 'groundbreaking', 'ultimate', 'In a world where', 'In an era of'];
  for (const tell of aiTells) {
    if (text.toLowerCase().includes(tell.toLowerCase())) {
      issues.push(`AI tell: "${tell}"`);
    }
  }
  
  return { pass: issues.length === 0, issues };
}

// === CARD GENERATION ===
async function generateNewsCard(headline) {
  const cardPath = `/tmp/rss-card-${Date.now()}.png`;
  const cardText = headline.length > 100 ? headline.slice(0, 97) + '...' : headline;
  
  try {
    const { generateCard } = await import(PATHS.cardScript);
    await generateCard({
      text: cardText,
      outPath: cardPath,
      type: 'quote',
      handle: '@btcmaxistheway',
    });
    return cardPath;
  } catch (e) {
    log(`WARN: Card generation failed: ${e.message}`);
    return null;
  }
}

// === TELEGRAM NOTIFICATION ===
async function sendTelegramMessage(message, replyMarkup = null) {
  if (DRY_RUN) {
    log('DRY RUN: Would send Telegram message:');
    log(message.slice(0, 500) + (message.length > 500 ? '...' : ''));
    if (replyMarkup) log('Buttons: ' + JSON.stringify(replyMarkup));
    return { ok: true, messageId: 'dry-run' };
  }
  
  const url = `https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`;
  
  const payload = {
    chat_id: TELEGRAM.chatId,
    message_thread_id: TELEGRAM.messageThreadId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };
  
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  
  try {
    const result = await httpsRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, payload);
    
    if (result.status === 200 && result.body.ok) {
      return { ok: true, messageId: result.body.result?.message_id };
    } else {
      log(`WARN: Telegram message failed: ${JSON.stringify(result.body)}`);
      return { ok: false, error: result.body };
    }
  } catch (e) {
    log(`WARN: Telegram message error: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function sendTelegramPhoto(photoPath, caption = '') {
  if (DRY_RUN) {
    log('DRY RUN: Would send Telegram photo');
    return { ok: true, messageId: 'dry-run' };
  }
  
  const url = `https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendPhoto`;
  
  try {
    const photoBuffer = fs.readFileSync(photoPath);
    
    const { boundary, body } = buildMultipartFormData(
      {
        chat_id: TELEGRAM.chatId,
        message_thread_id: TELEGRAM.messageThreadId,
        caption: caption,
        parse_mode: 'HTML',
      },
      [{ fieldName: 'photo', filename: 'card.png', contentType: 'image/png', buffer: photoBuffer }]
    );
    
    const result = await httpsRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    }, body);
    
    if (result.status === 200 && result.body.ok) {
      return { ok: true, messageId: result.body.result?.message_id };
    }
    return { ok: false, error: result.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendApprovalRequest(approval, score) {
  const { draftTweet, sourceUrl, headline, category, cardImagePath, suggestedAngle } = approval;
  
  if (cardImagePath && fs.existsSync(cardImagePath)) {
    await sendTelegramPhoto(cardImagePath, `📰 ${headline.slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 500));
  }
  
  const b = score.breakdown;
  const breakdownStr = `rec:${b.recency.score}/auth:${b.authority.score}/conf:${b.confirmation.score}/imp:${b.impact.score}/ang:${b.angle.score}`;
  const angleText = suggestedAngle ? `\n🎯 Angle: ${suggestedAngle.slice(0, 100)}` : '';
  
  const message = `📡 <b>RSS MONITOR — Approval Required</b>

📰 ${headline.slice(0, 200)}
🔗 ${sourceUrl}
🏷️ Category: ${category}
📊 Score: <b>${score.total}/120</b> (${breakdownStr})${angleText}

━━━ TWEET AS IT WOULD APPEAR ━━━
<code>${escapeHtml(draftTweet)}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${cardImagePath ? '🖼️ Image card attached above ↑\n' : ''}⏰ Expires in 2 hours if not approved`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `APPROVE_REACTIVE:${approval.id}` },
      { text: '❌ Reject', callback_data: `REJECT_REACTIVE:${approval.id}` },
    ]],
  };
  
  return sendTelegramMessage(message, replyMarkup);
}

// === MAIN PROCESSING ===
async function processFeeds() {
  const rssState = loadRssState();
  const dedupStore = loadDedupStore();
  const approvalState = cleanExpiredApprovals(loadApprovalState());
  const pendingUrls = new Set(approvalState.pendingApprovals.map(p => hashUrl(p.sourceUrl)));
  
  const newItems = [];
  const feedResults = [];
  
  // Fetch all feeds in parallel
  log(`Fetching ${RSS_FEEDS.length} RSS feeds...`);
  const feedPromises = RSS_FEEDS.map(feed => fetchFeed(feed));
  const results = await Promise.all(feedPromises);
  
  for (const result of results) {
    if (result.error) {
      log(`  ${result.feed.name}: ERROR - ${result.error}`);
      rssState.feedErrors[result.feed.url] = result.error;
      feedResults.push({ name: result.feed.name, status: 'error', error: result.error });
    } else {
      log(`  ${result.feed.name}: ${result.items.length} items`);
      feedResults.push({ name: result.feed.name, status: 'ok', items: result.items.length });
      
      for (const item of result.items) {
        // Skip if already seen
        if (rssState.seenGuids.includes(item.guid)) continue;
        
        // Skip if too old (>6 hours)
        if (!isRecent(item.pubDate, 6)) continue;
        
        // Skip blocked domains
        if (isBlockedDomain(item.link)) continue;
        
        // Skip blocked content patterns
        const fullText = `${item.title} ${item.description || ''}`;
        if (matchesBlockedPattern(fullText)) continue;
        
        // Skip if already posted
        if (isAlreadyPosted(dedupStore, item.link)) continue;
        
        // Skip if pending approval
        if (pendingUrls.has(hashUrl(item.link))) continue;
        
        // Skip if similar story posted recently
        if (isSimilarStoryPosted(dedupStore, item.title)) continue;
        
        // Match category
        const category = matchCategory(item);
        if (!category) continue;
        
        // Add to new items with feed authority
        newItems.push({
          ...item,
          feedName: result.feed.name,
          feedAuthority: result.feed.authority,
          category,
        });
        
        // Mark as seen
        rssState.seenGuids.push(item.guid);
      }
    }
  }
  
  rssState.lastChecked = new Date().toISOString();
  saveRssState(rssState);
  
  log(`Found ${newItems.length} new categorized items after filtering`);
  
  return { newItems, feedResults };
}

async function main() {
  const startTime = Date.now();
  log('RUN START' + (DRY_RUN ? ' (DRY RUN)' : '') + (INIT_MODE ? ' (INIT MODE)' : ''));
  
  try {
    rotateLogs(); // rotate logs before anything else (>50KB → archive)
    loadConfig();
    log('Config loaded successfully');
    
    // Init mode: just mark all current items as seen
    if (INIT_MODE) {
      log('INIT MODE: Marking all current items as seen...');
      const rssState = loadRssState();
      
      for (const feed of RSS_FEEDS) {
        const result = await fetchFeed(feed);
        if (result.error) {
          log(`  ${feed.name}: ERROR - ${result.error}`);
        } else {
          log(`  ${feed.name}: Marking ${result.items.length} items as seen`);
          for (const item of result.items) {
            if (!rssState.seenGuids.includes(item.guid)) {
              rssState.seenGuids.push(item.guid);
            }
          }
        }
      }
      
      rssState.lastChecked = new Date().toISOString();
      saveRssState(rssState);
      log(`INIT COMPLETE: ${rssState.seenGuids.length} items marked as seen`);
      return;
    }
    
    // Normal run
    const { newItems, feedResults } = await processFeeds();
    
    if (newItems.length === 0) {
      log('No new categorized items found');
      log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return;
    }
    
    // Group similar stories across feeds
    const stories = [];
    for (const item of newItems) {
      let found = false;
      for (const story of stories) {
        const itemWords = new Set(normalizeHeadline(item.title));
        const storyWords = new Set(normalizeHeadline(story.headline));
        const overlap = [...itemWords].filter(w => storyWords.has(w)).length;
        if (overlap / Math.max(itemWords.size, storyWords.size) > 0.5) {
          story.sources.push(item);
          story.sourceCount++;
          if (item.feedAuthority > story.feedAuthority) {
            story.feedAuthority = item.feedAuthority;
          }
          found = true;
          break;
        }
      }
      
      if (!found) {
        stories.push({
          headline: item.title,
          description: item.description,
          sourceUrl: item.link,
          pubDate: item.pubDate,
          category: item.category,
          feedAuthority: item.feedAuthority,
          sourceCount: 1,
          sources: [item],
        });
      }
    }
    
    log(`Grouped into ${stories.length} unique stories`);
    
    // Score stories
    const scoredStories = [];
    for (const story of stories) {
      const score = await calculateScore(story);
      
      if (score.discard) {
        log(`  DISCARD: "${story.headline.slice(0, 40)}..." — ${score.discardReason}`);
        continue;
      }
      
      const threshold = story.category.threshold;
      if (score.total < threshold) {
        log(`  BELOW THRESHOLD (${score.total}/${threshold}): "${story.headline.slice(0, 40)}..."`);
        continue;
      }
      
      log(`  SCORE ${score.total}/${threshold}+: "${story.headline.slice(0, 40)}..."`);
      scoredStories.push({ story, score });
    }
    
    if (scoredStories.length === 0) {
      log('No post-worthy news this scan');
      log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return;
    }
    
    // Take best scoring story
    scoredStories.sort((a, b) => b.score.total - a.score.total);
    const { story, score } = scoredStories[0];
    
    log(`Processing best story: "${story.headline.slice(0, 60)}..." (score: ${score.total})`);
    
    // Generate draft
    let draft = null;
    let qgResult = null;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      draft = await generateDraft(story, score.suggestedAngle);
      if (!draft) continue;
      
      qgResult = qualityGate(draft);
      log(`Quality gate: ${qgResult.pass ? 'PASS' : 'FAIL'} (attempt ${attempt})${qgResult.issues.length ? ` - ${qgResult.issues.join(', ')}` : ''}`);
      
      if (qgResult.pass) break;
    }
    
    if (!draft || !qgResult?.pass) {
      log('Quality gate failed after 2 attempts, skipping story');
      log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return;
    }
    
    // Generate card
    const cardPath = await generateNewsCard(story.headline);
    
    // Create approval (RSS monitor always uses approval flow)
    const approvalState = loadApprovalState();
    const approval = {
      id: randomUUID(),
      draftTweet: draft.text,
      sourceUrl: draft.sourceUrl,
      headline: story.headline,
      category: story.category.id,
      cardImagePath: cardPath,
      suggestedAngle: score.suggestedAngle,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SCORING.APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000).toISOString(),
      source: 'rss',
    };
    
    addPendingApproval(approvalState, approval);
    log(`Created pending approval: ${approval.id}`);
    
    await sendApprovalRequest(approval, score);
    log('Sent approval request to Telegram');
    
  } catch (e) {
    log(`FATAL ERROR: ${e.message}`);
    log(e.stack);
  }
  
  log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
}

main().catch(e => {
  log(`UNCAUGHT ERROR: ${e.message}`);
  process.exit(1);
});
