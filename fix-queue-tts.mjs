#!/usr/bin/env node
/**
 * fix-queue-tts.mjs
 * One-shot script: trim TTS fields on 9 scripts in content-queue.json,
 * then unblock the 4 blocked posts.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, 'instagram/data/content-queue.json');

const wc = t => t.trim().split(/\s+/).filter(Boolean).length;

const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));

// Helper to verify word count
function check(field, text, maxWords = 28) {
  const w = wc(text);
  if (w > maxWords) {
    console.error(`❌ ${field}: ${w} words (max ${maxWords}) — TEXT: ${text}`);
    process.exit(1);
  }
  return w;
}

// ──────────────────────────────────────────────
// Trim helpers — apply per-script
// ──────────────────────────────────────────────

const patches = {

  'reel-descript-overdub-fix': (post) => {
    // total was 131, need ≤ 125
    // points[1].tts: 35 → 23 (cut 12)
    post.points[1].tts = "Find the mistake in the transcript, type the correct word, and Descript re-renders that segment in your cloned voice. Matches surrounding audio. Undetectable.";
    return post;
  },

  'reel-ai-productivity-myth': (post) => {
    // total was 139, need ≤ 125
    // proofTTS: 30 → 20 (cut 10); agitateTTS: 25 → 19 (cut 6)
    post.agitateTTS = "HBR named it workslop — AI-polished content that looks professional but offloads thinking onto your reader. More tools, more workslop.";
    post.proofTTS = "HBR named the failure mode: workslop. AI-polished content that offloads the thinking. Keep judgment calls human. Generation is AI's job.";
    return post;
  },

  'reel-claude-extended-thinking': (post) => {
    // total was 165, need ≤ 125; 4 segments over 28
    // hookTTS: 33 → 17 (cut 16)
    post.hookTTS = "Claude's Extended Thinking saves you an hour or wastes twenty minutes. Depends entirely on when you activate it.";
    // points[0].tts: 34 → 24 (cut 10)
    post.points[0].tts = "Turn it off for writing tasks, summaries, captions, rewrites — anything one or two steps. Toggle off in the model selector. Same output, thirty seconds.";
    // points[1].tts: 31 → 20 (cut 11)
    post.points[1].tts = "Strategy decisions, debugging, multi-step planning — turn it on. Problems with more than three steps see real quality gains. Two rules.";
    // proofTTS: 30 → 21 (cut 9)
    post.proofTTS = "Complex strategy with Extended Thinking on: deeper reasoning, worth the wait. Simple caption: same output, minutes wasted. One toggle, two rules.";
    return post;
  },

  'reel-beehiiv-delete-subscribers': (post) => {
    // total was 156, need ≤ 125
    // agitateTTS: 25 → 19 (cut 6)
    post.agitateTTS = "Every inactive subscriber drags your open rate down. Low open rates signal spam to providers. Readers stop seeing you.";
    // points[1].tts: 34 → 21 (cut 13)
    post.points[1].tts = "Filter by inactive tag, select all, delete. Not unsubscribe — delete. Open rate climbs as dead weight clears. Smaller list, better numbers.";
    // proofTTS: 36 → 23 (cut 13)
    post.proofTTS = "List hygiene is the most underrated deliverability lever. Inactive subscribers hurt you. Delete them. Open rate goes up, you leave the promotions tab.";
    return post;
  },

  'reel-gemini-imagen-500-free-daily': (post) => {
    // total was 137, need ≤ 125
    // hookTTS: 23 → 18 (cut 5)
    post.hookTTS = "Gemini App gives one hundred images per day. AI Studio gives five hundred to one thousand — same account.";
    // agitateTTS: 19 → 15 (cut 4)
    post.agitateTTS = "You burn through one hundred images testing variations. Gemini blocks you. Wait twenty-four hours or pay.";
    // points[2].tts: 22 → 18 (cut 4)
    post.points[2].tts = "Last step — download the best one. Add text in Canva if needed. Five hundred images daily, zero cost.";
    // proofTTS: 22 → 19 (cut 3)
    post.proofTTS = "AI Studio: five hundred to one thousand free images daily. Same account as Gemini App — ten times the limit.";
    return post;
  },

  'reel-notebooklm-audio-overview-commute': (post) => {
    // total was 129, need ≤ 125
    // agitateTTS: 19 → 15 (cut 4)
    post.agitateTTS = "You block two hours for deep research. Someone interrupts. Morning gone. Research pushed to tomorrow.";
    return post;
  },

  'reel-chatgpt-custom-gpt-repetitive-tasks': (post) => {
    // total was 138, need ≤ 125
    // agitateTTS: 20 → 15 (cut 5)
    post.agitateTTS = "Write caption in my brand voice, avoid corporate speak. Next chat, paste it all again.";
    // points[2].tts: 23 → 18 (cut 5)
    post.points[2].tts = "Open that Custom GPT every time. Describe the topic. It handles your style automatically — consistent captions in five minutes.";
    // proofTTS: 21 → 16 (cut 5)
    post.proofTTS = "Custom GPTs free on all tiers. Most people repaste brand docs every chat. This remembers forever.";
    return post;
  },

  'reel-perplexity-5-pro-searches-optimization': (post) => {
    // total was 138, need ≤ 125
    // agitateTTS: 24 → 14 (cut 10)
    post.agitateTTS = "You burn Pro Searches on basic questions. Need cited research for a proposal — searches gone.";
    // proofTTS: 22 → 16 (cut 6)
    post.proofTTS = "Five Pro Searches daily, free tier. Most burn them on basic questions. Save for cited research.";
    return post;
  },

  'reel-elevenlabs-voice-clone-5-dollars': (post) => {
    // total was 141, need ≤ 125
    // hookTTS: 22 → 16 (cut 6)
    post.hookTTS = "Voice talent costs one hundred per video. ElevenLabs clones your voice for five dollars monthly — unlimited.";
    // agitateTTS: 23 → 17 (cut 6)
    post.agitateTTS = "You pay a voice actor one hundred. Client wants revisions — another fifty. Your voice clone revises for free.";
    // proofTTS: 24 → 17 (cut 7)
    post.proofTTS = "Voice talent costs one hundred per video. ElevenLabs Starter: five monthly, unlimited generations. First video breaks even.";
    return post;
  },
};

// ──────────────────────────────────────────────
// Apply patches + verify
// ──────────────────────────────────────────────

const MAX_SEG = 28;
const MAX_TOTAL = 125;

let allOk = true;

for (const post of queue.posts) {
  const patch = patches[post.id];
  if (!patch) continue;

  patch(post);

  // Unblock if blocked
  if (post.status === 'blocked') {
    post.status = 'needs-review';
    delete post.blockedAt;
    delete post.blockReason;
    console.log(`✅ Unblocked: ${post.id}`);
  }

  // Verify limits
  const segs = [
    { f: 'hookTTS', t: post.hookTTS || '' },
    { f: 'agitateTTS', t: post.agitateTTS || '' },
    ...((post.points || []).map((p, i) => ({ f: `points[${i}].tts`, t: p.tts || '' }))),
    { f: 'proofTTS', t: post.proofTTS || '' },
    { f: 'ctaTTS', t: post.ctaTTS || '' },
  ];
  let total = 0;
  for (const s of segs) {
    const w = wc(s.t);
    total += w;
    if (w > MAX_SEG) {
      console.error(`❌ ${post.id} / ${s.f}: ${w} words > ${MAX_SEG}`);
      allOk = false;
    }
  }
  if (total > MAX_TOTAL) {
    console.error(`❌ ${post.id} total: ${total} words > ${MAX_TOTAL}`);
    allOk = false;
  } else {
    console.log(`✅ ${post.id}: total ${total} words ✓`);
  }
}

if (!allOk) {
  console.error('\n❌ Verification failed — not writing changes.');
  process.exit(1);
}

queue.updatedAt = new Date().toISOString();
writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
console.log('\n✅ content-queue.json updated successfully.');
