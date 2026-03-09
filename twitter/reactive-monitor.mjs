#!/usr/bin/env node
/**
 * reactive-monitor.mjs — Auto-post breaking Bitcoin news for @btcmaxistheway
 * 
 * v3.1 — 2026-03-02 Added Corporate/Institutional First-Time Adoption & Government Perception Shifts
 * 
 * Changes from v3.0:
 * - 10 main categories + 2 conditional (up from 8+2)
 * - Added per-category freshness (pw for slow-moving categories)
 * - NEW: institutional_first_adoption — First-time entrants only (not repeat buyers)
 * - NEW: government_perception_shift — Arc of legitimization (research papers, hearings, statements)
 * 
 * v3.0 — 2026-03-02 Expanded Categories & Angle Quality Scoring
 * - 8 main categories + 2 conditional (up from 5)
 * - Added angle quality scoring (6th dimension, 0-20 points)
 * - Total score now 0-120 (was 0-100)
 * - Per-category thresholds
 * - Blocked domains list (content farms)
 * - Content pattern filters (price predictions, TA, etc.)
 * 
 * Categories:
 * 1. Exchange failures (hack/insolvency/freeze)
 * 2. Regulatory actions
 * 3. Institutional Bitcoin (with size filter)
 * 4. Government seizures
 * 5. Central bank emergency
 * 6. Currency crises
 * 7. Nation-state adoption
 * 8. Self-custody news
 * 9. Mining events (CONDITIONAL - threshold 75)
 * 10. Protocol development (CONDITIONAL - threshold 80)
 * 11. Institutional first-time adoption (NEW v3.1 - freshness: pw)
 * 12. Government perception shifts (NEW v3.1 - freshness: pw)
 * 
 * Usage:
 *   node reactive-monitor.mjs           # Full run
 *   node reactive-monitor.mjs --dry-run # Test without posting/notifying
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

// === CONFIGURATION ===
const CONFIG = {
  braveApiKey: null,
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
  logFile: '/root/.openclaw/workspace/memory/reactive-monitor.log',
  writingRules: '/root/.openclaw/workspace/memory/writing-rules.md',
  cardScript: '/root/.openclaw/workspace/scripts/twitter/generate-card.mjs',
};

const TELEGRAM = {
  chatId: '-1003879867373',
  messageThreadId: 6,
};

// === SCORING CONFIGURATION (v3.0 - now /120) ===
const SCORING = {
  APPROVAL_EXPIRY_HOURS: 2,
  // Per-category thresholds defined in CATEGORIES
};

// Source authority scoring (higher = better)
const SOURCE_AUTHORITY = {
  // Tier 1: 25 points - mainstream credible
  'reuters.com': 25,
  'ft.com': 25,
  'bloomberg.com': 25,
  'wsj.com': 25,
  'bbc.com': 25,
  'nytimes.com': 25,
  'apnews.com': 25,
  // Tier 2: 20 points - crypto-native reliable
  'coindesk.com': 20,
  'bitcoinmagazine.com': 20,
  'theblock.co': 20,
  'decrypt.co': 20,
  // Tier 3: 15 points - usable with verification
  'cointelegraph.com': 15,
  'blockworks.co': 15,
  // Unknown: 5 points
};

// Source authority ranking for sorting (lower = better)
const SOURCE_RANK = {
  'reuters.com': 1, 'ft.com': 1, 'bloomberg.com': 1, 'wsj.com': 1,
  'bbc.com': 1, 'nytimes.com': 1, 'apnews.com': 1,
  'coindesk.com': 2, 'bitcoinmagazine.com': 2, 'theblock.co': 2, 'decrypt.co': 2,
  'cointelegraph.com': 3, 'blockworks.co': 3,
};

// Blocked domains (content farms, noise sources)
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

// === CATEGORIES (v3.0 - expanded to 10) ===
const CATEGORIES = [
  {
    id: 'exchange_failure',
    name: 'Exchange hack/insolvency/withdrawal freeze',
    threshold: 60,      // Min to post
    autoThreshold: 85,  // Auto-post without approval
    freshness: 'pd',    // Past day — time-sensitive
    queries: [
      'bitcoin exchange hack OR insolvency OR withdrawal freeze 2026',
      'crypto exchange customer funds stolen OR missing OR inaccessible',
    ],
    keywords: ['hack', 'breach', 'insolvency', 'bankrupt', 'freeze', 'suspended', 'stolen', 'missing', 'collapse'],
    negativeKeywords: ['opinion', 'analysis', 'could', 'might', 'rumor', 'if', 'prediction'],
    impactGuide: '>$100M: 20-25, $10M-$100M: 10-19, <$10M: 0-9',
    angleHint: 'Not your keys, not your coins. Custody risk. Trust dependencies.',
  },
  {
    id: 'regulatory_action',
    name: 'Regulatory action against Bitcoin or self-custody',
    threshold: 65,
    autoThreshold: 90,
    freshness: 'pd',
    queries: [
      'bitcoin SEC CFTC regulation enforcement ban enacted passed',
      'bitcoin self-custody regulation threat OR ban 2026',
    ],
    keywords: ['SEC', 'CFTC', 'lawsuit', 'enforcement', 'ban', 'ruling', 'fine', 'enacted', 'passed'],
    negativeKeywords: ['proposed', 'considering', 'might', 'could', 'opinion', 'analysis', 'if passed'],
    impactGuide: 'US federal ruling: 20-25, US state/EU: 10-19, other: 0-9',
    angleHint: 'Sovereignty under attack. If they ban it, it was working. Regulators gonna regulate.',
  },
  {
    id: 'institutional_bitcoin',
    name: 'Major bank/institution Bitcoin custody or treasury',
    threshold: 75,       // Higher threshold - lots of noise
    autoThreshold: 95,
    freshness: 'pd',
    queries: [
      'bank corporation bitcoin treasury custody billion announced',
    ],
    keywords: ['custody', 'treasury', 'purchase', 'bought', 'acquire', 'holding', 'announce', 'billion'],
    negativeKeywords: ['rumor', 'considering', 'might', 'could', 'speculation', 'small', 'startup', 'report'],
    impactGuide: '$1B+ or Fortune 100: 20-25, $100M-$1B: 10-19, <$100M: skip',
    angleHint: 'Historical arc: what they said before vs now. Capitulation narrative. NOT cheerleading.',
  },
  {
    id: 'government_seizure',
    name: 'Government seizure of Bitcoin',
    threshold: 60,
    autoThreshold: 85,
    freshness: 'pd',
    queries: [
      'government DOJ FBI bitcoin seized confiscated forfeiture large',
    ],
    keywords: ['seized', 'confiscate', 'forfeit', 'DOJ', 'FBI', 'arrest', 'seize'],
    negativeKeywords: ['years ago', 'historic', 'old case', 'opinion'],
    impactGuide: '>$500M: 20-25, $50M-$500M: 10-19, <$50M: 0-9',
    angleHint: 'Custody matters. Government can seize from exchanges, not from self-custody.',
  },
  {
    id: 'central_bank_emergency',
    name: 'Central bank emergency policy',
    threshold: 70,
    autoThreshold: 90,
    freshness: 'pd',
    queries: [
      'Federal Reserve ECB central bank emergency rate cut OR bailout OR QE',
      'bank bailout OR bank collapse OR bank run 2026',
    ],
    keywords: ['emergency', 'rate cut', 'QE', 'quantitative easing', 'bailout', 'intervention', 'crisis'],
    negativeKeywords: ['expected', 'forecast', 'prediction', 'unchanged', 'as anticipated', 'gradual', 'routine'],
    impactGuide: 'Fed/ECB/BOJ emergency: 20-25, other central bank: 10-19, routine policy: skip',
    angleHint: 'Fiat fragility. Emergency = admission. The asymmetry between bailout recipients.',
  },
  {
    id: 'currency_crisis',
    name: 'Currency devaluation/capital controls/hyperinflation',
    threshold: 55,       // Lower threshold - high signal
    autoThreshold: 80,
    freshness: 'pd',
    queries: [
      'currency devaluation OR hyperinflation OR capital controls crisis 2026',
      'bank account freeze OR currency black market OR peso OR lira OR naira collapse',
    ],
    keywords: ['devaluation', 'collapse', 'capital controls', 'hyperinflation', 'freeze', 'shortage', 'crisis', 'crash'],
    negativeKeywords: ['forecast', 'prediction', 'could', 'might', 'historical', 'years ago', 'opinion'],
    impactGuide: 'G20 economy: 20-25, mid-size economy: 10-19, small economy: 5-9',
    angleHint: 'This is why Bitcoin exists. Sovereignty. Escape from state monetary control. Those who held BTC kept value.',
  },
  {
    id: 'nation_state_adoption',
    name: 'Country adopts Bitcoin (legal tender/reserves)',
    threshold: 50,       // Lowest threshold - very rare, very significant
    autoThreshold: 75,
    freshness: 'pd',
    queries: [
      'country nation bitcoin legal tender OR strategic reserve OR central bank purchase',
      'sovereign wealth fund OR government bitcoin treasury reserve announced',
    ],
    keywords: ['legal tender', 'strategic reserve', 'sovereign', 'nation', 'country', 'central bank', 'government'],
    negativeKeywords: ['proposed', 'considering', 'rumor', 'might', 'could', 'speculation', 'debate'],
    impactGuide: 'Legal tender: 25, strategic reserve: 20-24, considering (if official): 10-19',
    angleHint: 'Structural significance. Game theory. First mover advantages. Pattern vs experiment.',
  },
  {
    id: 'self_custody_news',
    name: 'Self-custody security/regulation news',
    threshold: 65,
    autoThreshold: 90,
    freshness: 'pd',
    queries: [
      'bitcoin self-custody hardware wallet vulnerability OR regulation threat',
    ],
    keywords: ['vulnerability', 'security', 'flaw', 'breach', 'self-custody', 'regulation', 'threat', 'failure'],
    negativeKeywords: ['review', 'comparison', 'best', 'guide', 'tutorial', 'how to', 'setup'],
    impactGuide: 'Critical vulnerability: 20-25, custody provider failure: 15-20, minor issue: 5-14',
    angleHint: 'Core brand. Self-custody education. Disclosed vulnerability = fixed vulnerability.',
  },
  {
    id: 'mining_events',
    name: 'Major mining events',
    threshold: 75,       // Conditional - higher threshold
    autoThreshold: 95,
    freshness: 'pd',
    conditional: true,
    queries: [
      'bitcoin mining country ban OR major miner bankruptcy OR hashrate crash',
    ],
    keywords: ['mining ban', 'hashrate', 'crash', 'bankruptcy', 'shutdown', 'illegal'],
    negativeKeywords: ['opinion', 'analysis', 'minor', 'small', 'difficulty adjustment', 'normal'],
    impactGuide: 'China-level ban: 20-25, major miner failure: 15-20, hashrate drop >25%: 10-19',
    angleHint: 'Proof of work. Antifragility. Network survived worse.',
  },
  {
    id: 'protocol_development',
    name: 'Bitcoin protocol milestones',
    threshold: 80,       // Very selective
    autoThreshold: 100,
    freshness: 'pd',
    conditional: true,
    queries: [
      'bitcoin soft fork OR lightning network milestone activated',
    ],
    keywords: ['activated', 'upgrade', 'milestone', 'soft fork', 'lightning'],
    negativeKeywords: ['proposed', 'debate', 'BIP', 'discussion', 'review', 'testing'],
    impactGuide: 'Consensus upgrade activated: 20-25, Lightning milestone: 15-20',
    angleHint: 'Decentralized upgrades. No permission needed. Protocol indifference to politics.',
  },
  // ================== NEW CATEGORIES (v3.1) ==================
  {
    id: 'institutional_first_adoption',
    name: 'First-time institutional Bitcoin adoption (new category of institution)',
    threshold: 70,       // Moderate threshold - quality over quantity
    autoThreshold: 90,
    freshness: 'pw',     // Past week - slower moving
    queries: [
      'pension fund OR insurance OR endowment bitcoin first allocation treasury announced',
      'family office OR sovereign wealth fund bitcoin investment first disclosed',
    ],
    keywords: ['pension', 'insurance', 'endowment', 'foundation', 'family office', 'first', 'announces', 'allocates', 'treasury', 'allocation'],
    negativeKeywords: ['MicroStrategy', 'Strategy', 'considering', 'might', 'could', 'rumor', 'speculation', 'adds more', 'increases', 'additional'],
    impactGuide: 'First of a category (first pension fund, first insurance co): 20-25, First of a sub-type: 15-19, Repeat buyer adding more: 0-5 (skip)',
    angleHint: 'The signal is "first time" — a new category of institution crossing the threshold. When a pension fund holds Bitcoin, it has accepted that the alternative is a slow guaranteed loss. That is not an investment thesis. That is a confession. Focus on what capitulation looks like at institutional scale. NOT "this is bullish."',
    // Custom scoring rules for this category
    firstTimeBonus: true,  // Score boost for genuinely first-time entrants
  },
  {
    id: 'government_perception_shift',
    name: 'Nation/government perception shift on Bitcoin',
    threshold: 65,       // Moderate - softer signals need verification
    autoThreshold: 88,
    freshness: 'pw',     // Past week - these develop slowly
    queries: [
      'central bank OR parliament OR congress bitcoin research OR hearing OR official statement',
      'minister OR president OR politician bitcoin position OR statement OR policy 2026',
    ],
    keywords: ['central bank', 'parliament', 'congress', 'committee', 'hearing', 'minister', 'president', 'research', 'study', 'report', 'framework', 'position', 'statement', 'policy'],
    negativeKeywords: ['unchanged', 'reaffirms', 'continues', 'routine', 'minor', 'local', 'opinion piece', 'analyst'],
    impactGuide: 'Central bank research paper/study: 20-25, Parliamentary hearing (first time): 18-22, Head of state statement: 15-22, Regulatory proposal: 12-18, Minor official: 5-10',
    angleHint: 'Track the arc of legitimization. When a central bank writes a research paper, it stopped ignoring Bitcoin. When parliament holds a hearing, Bitcoin became impossible to dismiss. Each stage matters: hostile → ignoring → studying → neutral → curious → favorable. Even hostility reveals something about their monetary situation. The story is the shift, not the position.',
    // Track perception direction
    perceptionTracking: true,
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

// === CONFIG LOADING ===
function loadConfig() {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(PATHS.openclawConfig, 'utf8'));
    CONFIG.braveApiKey = ocConfig.tools?.web?.search?.apiKey;
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

  if (!CONFIG.braveApiKey) throw new Error('Missing Brave API key');
  if (!CONFIG.telegramBotToken) throw new Error('Missing Telegram bot token');
  if (!CONFIG.anthropicApiKey) throw new Error('Missing Anthropic API key');
  if (!CONFIG.twitter.apiKey) throw new Error('Missing Twitter credentials');
}

// === APPROVAL STATE MANAGEMENT ===
function loadApprovalState() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.approvalState, 'utf8'));
  } catch (e) {
    const defaultState = {
      mode: 'approval',
      postsApproved: 0,
      postsRejected: 0,
      approvalThreshold: 10,
      pendingApprovals: [],
    };
    saveApprovalState(defaultState);
    return defaultState;
  }
}

function saveApprovalState(state) {
  fs.writeFileSync(PATHS.approvalState, JSON.stringify(state, null, 2));
}

function cleanExpiredApprovals(state) {
  const now = Date.now();
  const expired = [];
  state.pendingApprovals = state.pendingApprovals.filter(p => {
    const expiry = new Date(p.expiresAt).getTime();
    if (expiry < now) {
      expired.push(p);
      return false;
    }
    return true;
  });
  return expired;
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

// === BRAVE SEARCH ===
async function braveSearch(query, freshness = 'pd') {
  const params = new URLSearchParams({
    q: query,
    count: '10',
    freshness: freshness,
    text_decorations: 'false',
  });
  
  const url = `https://api.search.brave.com/res/v1/web/search?${params}`;
  
  try {
    const result = await httpsRequest(url, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': CONFIG.braveApiKey,
        'Accept': 'application/json',
      },
    });
    
    if (result.status === 429) {
      log('WARN: Brave Search rate limit hit');
      return [];
    }
    
    if (result.status !== 200) {
      log(`WARN: Brave Search returned ${result.status}`);
      return [];
    }
    
    return result.body.web?.results || [];
  } catch (e) {
    log(`ERROR: Brave Search failed: ${e.message}`);
    return [];
  }
}

// === DEDUPLICATION ===
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

function isSimilarStoryPosted(store, headline, hours = 24) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const words = new Set(headline.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  for (const story of store.stories) {
    if (new Date(story.postedAt).getTime() < cutoff) continue;
    const storyWords = new Set(story.headline.toLowerCase().split(/\s+/).filter(w => w.length > 3));
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

// === NEWSWORTHINESS SCORING (v3.0 - now /120) ===

function scoreRecency(ageStr, freshness = 'pd') {
  if (!ageStr) return { score: 15, note: 'no timestamp, assumed recent' };
  
  try {
    const date = new Date(ageStr);
    const ageMs = Date.now() - date.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    const ageDays = ageHours / 24;
    
    // For weekly freshness categories (slower-moving institutional/government news)
    if (freshness === 'pw') {
      if (ageDays < 1) return { score: 25, note: '<1 day old' };
      if (ageDays < 2) return { score: 22, note: '1-2 days old' };
      if (ageDays < 4) return { score: 18, note: '2-4 days old' };
      if (ageDays < 7) return { score: 12, note: '4-7 days old' };
      return { score: 0, note: `>7 days old (${Math.round(ageDays)}d), discard` };
    }
    
    // Default: daily freshness (time-sensitive news)
    if (ageHours < 1) return { score: 25, note: '<1h old' };
    if (ageHours < 3) return { score: 20, note: '1-3h old' };
    if (ageHours < 6) return { score: 10, note: '3-6h old' };
    return { score: 0, note: `>6h old (${Math.round(ageHours)}h), discard` };
  } catch (e) {
    return { score: 15, note: 'unparseable timestamp' };
  }
}

function scoreSourceAuthority(sources) {
  let maxScore = 5;
  let bestSource = 'unknown';
  
  for (const source of sources) {
    for (const [domain, score] of Object.entries(SOURCE_AUTHORITY)) {
      if (source.url?.includes(domain)) {
        if (score > maxScore) {
          maxScore = score;
          bestSource = domain;
        }
      }
    }
  }
  
  return { score: maxScore, note: bestSource };
}

function scoreConfirmationCount(sourceCount) {
  if (sourceCount >= 4) return { score: 25, note: `${sourceCount} sources` };
  if (sourceCount === 3) return { score: 20, note: '3 sources' };
  if (sourceCount === 2) return { score: 10, note: '2 sources' };
  return { score: 0, note: 'single source, skip' };
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    });
    
    if (result.status !== 200) {
      log(`WARN: Impact scoring API returned ${result.status}`);
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
    log(`ERROR: Impact scoring failed: ${e.message}`);
    return { score: 10, note: 'exception, default' };
  }
}

/**
 * NEW: Angle Quality scoring (0-20 points)
 * Does this story create a genuine posting angle for @btcmaxistheway's voice?
 */
async function scoreAngleQuality(headline, description, category) {
  const prompt = `Rate the "angle quality" for @btcmaxistheway to comment on this news (0-20).

NEWS:
Headline: ${headline}
Description: ${description || 'N/A'}
Category: ${category.name}

ACCOUNT VOICE:
- Philosophical, structural analysis (not price-focused)
- Core themes: self-custody, sovereignty, proof of work, trustlessness
- Tone: calm, analytical, dry sarcasm when earned
- Avoids: generic takes everyone tweets, price pumping, hype

ANGLE HINT FOR THIS CATEGORY:
${category.angleHint}

SCORING:
- 16-20: Natural sharp angle. Account has something unique to say.
- 11-15: Angle exists but requires careful framing.
- 6-10: Weak angle. Most takes will be generic.
- 0-5: No angle. Just reporting a fact. Skip.

Respond with ONLY: "SCORE: [number] | ANGLE: [one sentence angle, or 'none' if score <6]"`;

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
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });
    
    if (result.status !== 200) {
      log(`WARN: Angle scoring API returned ${result.status}`);
      return { score: 10, note: 'API error, default score', angle: null };
    }
    
    const text = result.body.content?.[0]?.text?.trim() || '';
    const match = text.match(/SCORE:\s*(\d+)\s*\|\s*ANGLE:\s*(.+)/i);
    if (match) {
      const score = Math.min(20, Math.max(0, parseInt(match[1], 10)));
      const angle = match[2].toLowerCase() === 'none' ? null : match[2];
      return { score, note: `angle quality`, angle };
    }
    
    return { score: 10, note: 'parse error, default', angle: null };
  } catch (e) {
    log(`ERROR: Angle scoring failed: ${e.message}`);
    return { score: 10, note: 'exception, default', angle: null };
  }
}

/**
 * Calculate full newsworthiness score (now 0-120)
 */
async function calculateNewsworthinessScore(story) {
  const freshness = story.category?.freshness || 'pd';
  const recency = scoreRecency(story.sources[0]?.age, freshness);
  const authority = scoreSourceAuthority(story.sources);
  const confirmation = scoreConfirmationCount(story.sources.length);
  
  // Early exit: discard if too old or single source
  if (recency.score === 0) {
    return {
      total: 0,
      breakdown: { recency, authority, confirmation, impact: { score: 0, note: 'skipped' }, angle: { score: 0, note: 'skipped' } },
      discard: true,
      discardReason: recency.note,
    };
  }
  
  if (confirmation.score === 0) {
    return {
      total: 0,
      breakdown: { recency, authority, confirmation, impact: { score: 0, note: 'skipped' }, angle: { score: 0, note: 'skipped' } },
      discard: true,
      discardReason: confirmation.note,
    };
  }
  
  // Full scoring including impact AND angle quality
  const impact = await scoreImpactMagnitude(story.headline, story.description, story.category);
  const angle = await scoreAngleQuality(story.headline, story.description, story.category);
  
  // Discard if angle quality is too low (<6)
  if (angle.score < 6) {
    return {
      total: 0,
      breakdown: { recency, authority, confirmation, impact, angle },
      discard: true,
      discardReason: `Low angle quality (${angle.score}/20)`,
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

// === NEWS DETECTION ===
function getSourceRank(url) {
  for (const [domain, rank] of Object.entries(SOURCE_RANK)) {
    if (url.includes(domain)) return rank;
  }
  return 10;
}

function isRecent(dateStr, maxHours = 6, freshness = 'pd') {
  if (!dateStr) return true;
  // For weekly freshness, allow up to 7 days (168 hours)
  const effectiveMaxHours = freshness === 'pw' ? 168 : maxHours;
  try {
    const date = new Date(dateStr);
    const age = Date.now() - date.getTime();
    return age < effectiveMaxHours * 60 * 60 * 1000;
  } catch (e) {
    return true;
  }
}

function matchesCategory(result, category) {
  const text = `${result.title} ${result.description}`.toLowerCase();
  
  const hasKeyword = category.keywords.some(kw => text.includes(kw.toLowerCase()));
  if (!hasKeyword) return false;
  
  const hasNegative = category.negativeKeywords.some(kw => text.includes(kw.toLowerCase()));
  if (hasNegative) return false;
  
  return true;
}

async function findBreakingNews() {
  const dedupStore = loadDedupStore();
  const approvalState = loadApprovalState();
  const candidates = [];
  
  const pendingUrls = new Set(approvalState.pendingApprovals.map(p => hashUrl(p.sourceUrl)));
  
  for (const category of CATEGORIES) {
    log(`Searching category: ${category.name} (freshness: ${category.freshness || 'pd'})`);
    
    for (const query of category.queries) {
      const results = await braveSearch(query, category.freshness || 'pd');
      log(`  Query "${query.slice(0, 40)}..." → ${results.length} results`);
      
      for (const result of results) {
        // Skip blocked domains
        if (isBlockedDomain(result.url)) {
          continue;
        }
        
        // Skip blocked content patterns
        const fullText = `${result.title} ${result.description}`;
        if (matchesBlockedPattern(fullText)) {
          continue;
        }
        
        // Skip if already posted
        if (isAlreadyPosted(dedupStore, result.url)) {
          continue;
        }
        
        // Skip if pending approval
        if (pendingUrls.has(hashUrl(result.url))) {
          continue;
        }
        
        // Skip if similar story posted recently
        if (isSimilarStoryPosted(dedupStore, result.title)) {
          continue;
        }
        
        // Check if matches category
        if (!matchesCategory(result, category)) {
          continue;
        }
        
        // Check recency (6h for daily, 7d for weekly freshness)
        if (!isRecent(result.age, 6, category.freshness)) {
          continue;
        }
        
        candidates.push({
          ...result,
          category: category,
          sourceRank: getSourceRank(result.url),
        });
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Deduplicate by URL
  const seen = new Set();
  const unique = candidates.filter(c => {
    const hash = hashUrl(c.url);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
  
  // Sort by source authority
  unique.sort((a, b) => a.sourceRank - b.sourceRank);
  
  // Group by story
  const stories = [];
  for (const candidate of unique) {
    let found = false;
    for (const story of stories) {
      const words = new Set(candidate.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const storyWords = new Set(story.headline.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const overlap = [...words].filter(w => storyWords.has(w)).length;
      if (overlap / Math.max(words.size, storyWords.size) > 0.5) {
        story.sources.push(candidate);
        found = true;
        break;
      }
    }
    
    if (!found) {
      stories.push({
        headline: candidate.title,
        description: candidate.description,
        category: candidate.category,
        sources: [candidate],
      });
    }
  }
  
  log(`Found ${stories.length} unique stories`);
  
  return stories;
}

// === DRAFT GENERATION ===
async function generateDraft(story, suggestedAngle = null) {
  const writingRules = fs.readFileSync(PATHS.writingRules, 'utf8');
  const bestSource = story.sources[0];
  
  const angleGuidance = suggestedAngle 
    ? `SUGGESTED ANGLE (use as inspiration): ${suggestedAngle}`
    : `ANGLE HINT: ${story.category.angleHint}`;

  const prompt = `You are writing a reactive tweet for @btcmaxistheway about breaking Bitcoin news.

NEWS:
Headline: ${story.headline}
Description: ${story.description}
Category: ${story.category.name}
Sources: ${story.sources.map(s => s.url).join(', ')}

${angleGuidance}

VOICE RULES (follow exactly):
${writingRules.slice(0, 8000)}

CRITICAL CONSTRAINTS:
1. NO DASHES of any kind (no em-dashes —, no en-dashes –, no hyphens as separators)
2. Do NOT start with "I"
3. NO hashtags
4. Maximum 240 characters (leave room for URL)
5. End with a single newline, then the source URL on its own line
6. Be calm and analytical, not hype
7. Add your unique angle, don't just report the news

SOURCE URL TO APPEND: ${bestSource.url}

Write ONLY the tweet text (including the URL at the end). No commentary.`;

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
    
    const text = result.body.content?.[0]?.text?.trim();
    return { text, sourceUrl: bestSource.url, sourceHeadline: story.headline };
  } catch (e) {
    log(`ERROR: Draft generation failed: ${e.message}`);
    return null;
  }
}

// === QUALITY GATE ===
function qualityGate(draft) {
  const text = draft.text;
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
  
  if (text.length > 280) {
    issues.push(`Too long (${text.length} chars)`);
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
async function generateNewsCard(headline, sourceName) {
  const cardPath = `/tmp/reactive-card-${Date.now()}.png`;
  
  const cardText = headline.length > 100 
    ? headline.slice(0, 97) + '...'
    : headline;
  
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

// === TWITTER POSTING ===
function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, url, bodyParams, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: tokenKey,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...bodyParams };
  const sortedParams = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join('&');

  const baseString = [method.toUpperCase(), encode(url), encode(sortedParams)].join('&');
  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  return 'OAuth ' + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}="${encode(v)}"`)
    .join(', ');
}

async function postTweet(text) {
  if (DRY_RUN) {
    log('DRY RUN: Would post tweet:');
    log(text);
    return { success: true, tweetId: 'dry-run-12345', tweetUrl: 'https://x.com/btcmaxistheway/status/dry-run-12345' };
  }
  
  const url = 'https://api.x.com/2/tweets';
  const body = { text };
  const authHeader = oauthSign(
    'POST', url, {},
    CONFIG.twitter.apiKey,
    CONFIG.twitter.apiSecret,
    CONFIG.twitter.accessToken,
    CONFIG.twitter.accessTokenSecret
  );
  
  try {
    const result = await httpsRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    }, body);
    
    if (result.status === 201 && result.body.data) {
      const tweetId = result.body.data.id;
      return {
        success: true,
        tweetId,
        tweetUrl: `https://x.com/btcmaxistheway/status/${tweetId}`,
      };
    } else {
      log(`ERROR: Twitter API returned ${result.status}: ${JSON.stringify(result.body)}`);
      return { success: false, error: result.body };
    }
  } catch (e) {
    log(`ERROR: Twitter post failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// === TELEGRAM NOTIFICATION ===
async function sendTelegramMessage(message, replyMarkup = null) {
  if (DRY_RUN) {
    log('DRY RUN: Would send Telegram message:');
    log(message);
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
    log('DRY RUN: Would send Telegram photo:');
    log(`  Path: ${photoPath}`);
    log(`  Caption: ${caption}`);
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
      [
        {
          fieldName: 'photo',
          filename: 'card.png',
          contentType: 'image/png',
          buffer: photoBuffer,
        },
      ]
    );
    
    const result = await httpsRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    }, body);
    
    if (result.status === 200 && result.body.ok) {
      return { ok: true, messageId: result.body.result?.message_id };
    } else {
      log(`WARN: Telegram photo failed: ${JSON.stringify(result.body)}`);
      return { ok: false, error: result.body };
    }
  } catch (e) {
    log(`WARN: Telegram photo error: ${e.message}`);
    return { ok: false, error: e.message };
  }
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
  
  const message = `⚡ <b>REACTIVE TAKE — Approval Required</b>

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

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifySuccess(tweetText, tweetUrl, story) {
  const message = `⚡ <b>Auto-posted reactive take:</b>
${escapeHtml(tweetText.slice(0, 100))}${tweetText.length > 100 ? '...' : ''}

🔗 ${tweetUrl}
📰 Source: ${story.headline.slice(0, 80)}
Category: ${story.category.name}`;

  return sendTelegramMessage(message);
}

// === MAIN ===
async function main() {
  const startTime = Date.now();
  log('RUN START' + (DRY_RUN ? ' (DRY RUN)' : '') + ' — v3.0 (expanded categories + angle scoring)');
  
  try {
    loadConfig();
    log('Config loaded successfully');
    
    const approvalState = loadApprovalState();
    const expired = cleanExpiredApprovals(approvalState);
    for (const exp of expired) {
      log(`Expired pending approval: ${exp.id} (${exp.headline?.slice(0, 40)}...)`);
      const dedupStore = loadDedupStore();
      dedupStore.stories.push({
        id: hashUrl(exp.sourceUrl),
        headline: exp.headline,
        postedAt: new Date().toISOString(),
        status: 'expired',
        category: exp.category,
      });
      saveDedupStore(dedupStore);
    }
    if (expired.length > 0) {
      saveApprovalState(approvalState);
    }
    
    log(`Mode: ${approvalState.mode} (approved: ${approvalState.postsApproved}/${approvalState.approvalThreshold})`);
    
    const stories = await findBreakingNews();
    
    if (stories.length === 0) {
      log('No breaking news found');
      log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return;
    }
    
    log(`Scoring ${stories.length} stories...`);
    const scoredStories = [];
    
    for (const story of stories) {
      const score = await calculateNewsworthinessScore(story);
      
      if (score.discard) {
        log(`  DISCARD: "${story.headline.slice(0, 40)}..." — ${score.discardReason}`);
        continue;
      }
      
      // Check against category-specific threshold
      const threshold = story.category.threshold;
      if (score.total < threshold) {
        log(`  BELOW THRESHOLD (${score.total}/${threshold}): "${story.headline.slice(0, 40)}..."`);
        continue;
      }
      
      log(`  SCORE ${score.total}/${threshold}+: "${story.headline.slice(0, 40)}..."`);
      scoredStories.push({ story, score });
    }
    
    if (scoredStories.length === 0) {
      log('No post-worthy news this scan (all below category thresholds)');
      log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return;
    }
    
    // Sort by score descending, take the best one
    scoredStories.sort((a, b) => b.score.total - a.score.total);
    const { story, score } = scoredStories[0];
    
    log(`Processing best story: "${story.headline.slice(0, 60)}..." (score: ${score.total}, category: ${story.category.id})`);
    
    // Generate draft with suggested angle
    let draft = null;
    let qgResult = null;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      draft = await generateDraft(story, score.suggestedAngle);
      if (!draft) {
        log(`Draft generation failed (attempt ${attempt})`);
        continue;
      }
      
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
    const bestSource = story.sources[0];
    const sourceDomain = new URL(bestSource.url).hostname.replace('www.', '');
    const cardPath = await generateNewsCard(story.headline, sourceDomain);
    
    // Determine posting behavior
    const isApprovalMode = approvalState.mode === 'approval';
    const autoThreshold = story.category.autoThreshold;
    const isHighConfidence = score.total >= autoThreshold;
    const needsApproval = isApprovalMode || !isHighConfidence;
    
    if (needsApproval) {
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
      };
      
      addPendingApproval(approvalState, approval);
      log(`Created pending approval: ${approval.id}`);
      
      await sendApprovalRequest(approval, score);
      log('Sent approval request to Telegram');
      
      log(`RUN END — awaiting approval (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return;
    }
    
    // Auto-post mode with high confidence
    const postResult = await postTweet(draft.text);
    
    if (!postResult.success) {
      log('First post attempt failed, retrying...');
      await new Promise(r => setTimeout(r, 2000));
      const retryResult = await postTweet(draft.text);
      
      if (!retryResult.success) {
        log('Post failed after retry');
        log(`RUN END (duration: ${Math.round((Date.now() - startTime) / 1000)}s)`);
        return;
      }
      
      Object.assign(postResult, retryResult);
    }
    
    log(`Posted: ${postResult.tweetUrl}`);
    
    const dedupStore = loadDedupStore();
    dedupStore.stories.push({
      id: hashUrl(story.sources[0].url),
      headline: story.headline,
      postedAt: new Date().toISOString(),
      tweetUrl: postResult.tweetUrl,
      category: story.category.id,
      score: score.total,
    });
    saveDedupStore(dedupStore);
    
    if (approvalState.mode === 'approval') {
      approvalState.postsApproved++;
      if (approvalState.postsApproved >= approvalState.approvalThreshold) {
        approvalState.mode = 'auto';
        log('Threshold reached, switching to auto mode');
      }
      saveApprovalState(approvalState);
    }
    
    const notified = await notifySuccess(draft.text, postResult.tweetUrl, story);
    log(`Notified: ${notified.ok ? 'Telegram sent' : 'Telegram failed (non-blocking)'}`);
    
    if (cardPath && fs.existsSync(cardPath)) {
      try { fs.unlinkSync(cardPath); } catch (e) { /* ignore */ }
    }
    
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
