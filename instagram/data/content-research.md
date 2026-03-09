# @toolsforbuilders — Content Research & Institutional Knowledge

**Purpose:** Accumulated research that informs every piece of content. Read before drafting any script.
**Last updated:** 2026-03-05 (Opus research run)

---

## Genuinely Non-Obvious Tool Insights

### Claude
- **Extended Thinking toggle** — most people leave it on always (slow, expensive) or off always (miss the value). Real rule: ON for multi-step reasoning (strategy, debugging, planning). OFF for drafts and simple tasks. Saves 40–60% response time on routine work.
- **System prompt in chat** — add persistent persona/constraints to every reply without Projects. Few people know the difference between Projects context and live system prompts.
- **"Think step by step" still works** — explicit chain-of-thought outperforms default on math and reasoning tasks even without Extended Thinking.

### NotebookLM
- **Briefing Document feature** — generates auto-structured hierarchical outlines from chaotic notes/transcripts. Everyone uses it for Audio Overview podcasts. Almost nobody uses it to structure raw research.
- **Cross-source Q&A** — upload 5 sources and ask "what contradicts each other across these?" The comparative analysis is the underused killer use case.
- **Source limit** — 50 sources max per notebook; but quality beats quantity. 3 deep sources > 20 shallow ones.

### Perplexity
- **Academic Focus mode** — searches only peer-reviewed sources, not blog/SEO noise. Most people use Default mode and get opinion pieces.
- **Perplexity vs Gemini Deep Research distinction:**
  - Perplexity: best for citation-dense, stat-heavy quick pulls. Returns in <60 seconds. Prompt: "Give me 5 stats with sources on [topic]."
  - Gemini Deep Research: best for narrative depth, complex technical/regulatory landscape analysis (non-political). Takes 3–5 min but cross-references deeply. Prompt: "Deep research: explain [complex topic] landscape for a non-expert."
  - **They are NOT interchangeable.** Using Gemini for quick stats = overengineering. Using Perplexity for policy analysis = shallow output.
  - **⚠️ Brand rule — AI bias on political topics:** Never recommend a specific AI model for politically sensitive topics. All models carry bias on political content (in different directions). @toolsforbuilders stays neutral: acknowledge that AI models can be biased on political topics and recommend cross-checking across multiple sources/models rather than trusting any single one. This applies to scripts, captions, and comment replies.

### n8n
- **Self-hosted = unlimited free executions** — n8n Community Edition on a $5–10/mo VPS runs unlimited workflows. Make.com charges per operation: 10k ops = $16/mo, 50k ops = $83/mo.
- **At scale the math is stark:** if you run 5 automations daily at 200 ops each = 30k ops/month → Make costs $29/mo; n8n self-hosted costs $5/mo. Same workflows.
- **Setup time** — n8n self-hosted takes 2 hours once. Not for pure beginners, but any solopreneur who can follow a DigitalOcean tutorial can do it.

### Descript
- **Overdub** — clone your voice with 10 minutes of recorded audio. Then fix any mispronounced word or awkward pause by TYPING the correction. It re-renders with your voice. Most creators re-record entire sections instead.
- **Filler word removal** — one-click removes all "um", "uh", "like" from transcripts with audio sync. Free tier includes this.
- **Screen recording + transcript** — records screen + mic simultaneously and generates searchable transcript. Underused for tutorial content.

### Beehiiv
- **Auto-purge inactive subscribers** — counterintuitive but proven: deleting 90-day inactive subscribers improves deliverability, open rates, and ad RPM. Most newsletter operators hoard list size instead.
- **Referral automation** — set digital reward triggers (PDF, template, etc.) at 3 and 5 referrals. Delivers automatically. Beehiiv's built-in referral is more powerful than ConvertKit's.
- **Boosts marketplace** — paid newsletter discovery. Underused by new operators who don't know it exists.

### Otter.ai
- **AI Channels** — automatically pulls action items from meetings and assigns them as tasks. Not just transcription.
- **Live transcription in browser** — no desktop app needed. Share a link, others see live transcript in their browser.

### Gamma
- **Import from URL** — paste any article URL, Gamma auto-generates a slide deck from it. Not just from text paste. Unknown by most users.
- **One-prompt presentations** — "Create a 10-slide proposal for a social media agency client, professional tone, include numbers." Full deck in 60 seconds.

### Grammarly
- **Tone detector** — flags when your email sounds "aggressive" or "uncertain" before you send. More useful than grammar fixes for solopreneurs managing client comms.
- **Goals setting** — set audience, formality, domain per document. Most people write in default mode and get generic suggestions.

---

## Content Performance Patterns (from research)

### What performs on Reels/TikTok for AI tool content:
- **"I tested X tools for Y task"** — comparison formats dominate saves
- **Specific time claims** — "20 minutes", "3 hours" — concrete > vague
- **Free vs paid contrast** — "I cancelled my $X subscription" triggers massive saves
- **Workflow reveals** — step-by-step with named tools outperforms tool introductions
- **Contrarian takes** — "stop doing X" gets more views than "here's how to do X"

### What underperforms:
- Tool introductions without workflow context
- "AI saves you time" without specific proof
- Long lists of tools without a specific task
- "Hidden features" that aren't actually hidden to regular users

---

## AI Myths Solopreneurs Still Believe (valid Myth Bust content)

1. **"More AI = more productivity"** — HBR 2025 research identified "workslop": AI-polished content that looks professional but lacks substance. Offloads cognitive labor from creator to reader/client. Real productivity requires human judgment, not just AI generation.

2. **"AI tools save time automatically"** — Meta-analysis of 28 productivity experiments: no consistent gains without intentional workflow design. The variable is deployment, not the tool.

3. **"You need to learn prompt engineering"** — Wrong frame. AI responds to constraints and format directives, not engineered prompts. "Give me 5 bullets, under 200 words, no intro" beats a 5-paragraph setup.

4. **"ChatGPT is the best free AI for everything"** — False. Claude free tier is better for long-form writing. Gemini is better for research with real-time web access. Perplexity Academic mode is better for cited facts. ChatGPT wins for: code explanation, plugin ecosystem, image generation (DALL-E).

5. **"n8n is too technical for non-coders"** — Outdated. n8n has a drag-and-drop canvas like Make, 400+ integrations, and a 2025 UI redesign specifically for non-technical users.

---

## Approach to Content Generation (Principles)

### Research First, Always
Before drafting any script: check this file for existing insights. If the topic isn't covered here, web-search for non-obvious findings before writing.

### The 6-Month Test
Ask: would a solopreneur who has used AI tools for 6 months already know this?
- If yes → find a deeper angle or choose different topic
- If no → proceed

### Hook Quality Bar
First-person contrast AND stakes in one breath. Test: does the viewer think "wait, I'm doing it the wrong way"?

### Specificity is Trust
Every step needs one concrete detail: an exact number, prompt snippet, dollar amount, time claim, or named constraint. Vague instructions = untrustworthy content.

### TTS Voice Rules (Lennart Englisch voice)
- Short sentences close better. Split anything over 20 words.
- End on strong words, not past-tense verbs or prepositions.
- Em dash (—) forces a dramatic pause.
- Read aloud before generating — if your voice goes up at the end, rewrite it.
- Never end a slide on a question.
- Speed: 1.1 (set in generator). Target: 130–155 words total per reel = ~52–58 seconds.

---

## Do Not Repeat (Already Published)
- NotebookLM → Claude → Gemini research workflow (reel #1)

---

## Content Freshness Rules — No Repeats

### Core Rule
**Never generate a script on a topic already covered.** Before researching or drafting anything, check:
1. `data/archive/published.json` — scripts that have been posted to all platforms
2. `data/content-queue.json` — scripts queued but not yet posted
3. The "Do Not Repeat" list below

Only revisit a published topic when:
- The tool has released a major update that changes the workflow
- The original claim is now factually outdated (pricing changed, feature removed)
- It has been 6+ months since it was posted AND the topic has significantly evolved

When revisiting, the new script must be explicitly framed as an update: "We covered this 6 months ago. Here's what changed."

### Published Archive
The daily crosspost pipeline automatically appends used scripts to `data/archive/published.json`.
The weekly research script reads this file before proposing new topics.

### Do Not Repeat (Published)
- NotebookLM → Claude → Gemini 20-minute research workflow (posted: 2026-03-05, reel-research-workflow)

### Do Not Repeat (Queued — pick fresh topics only)
- Perplexity vs Gemini Deep Research comparison
- NotebookLM Briefing Document hidden feature
- n8n vs Make cost comparison
- Descript Overdub voice fix
- More AI ≠ more productivity (HBR myth bust)
- Claude Extended Thinking toggle workflow
- Beehiiv delete subscribers to grow
- Claude Projects feature on free tier for brand consistency (id: reel-claude-projects-free-brand-voice)
- Gemini AI Studio gives 500-1000 free images/day vs 100 in Gemini App (id: reel-gemini-imagen-500-free-daily)
- Make.com Instagram post to multi-platform in one scenario (id: reel-make-instagram-auto-crosspost)
- NotebookLM Audio Overview turns research into passive listening (id: reel-notebooklm-audio-overview-commute)
- Custom GPTs eliminate re-explaining repetitive tasks (id: reel-chatgpt-custom-gpt-repetitive-tasks)
- Perplexity 5 Pro Searches daily — how to maximize free tier (id: reel-perplexity-5-pro-searches-optimization)
- ElevenLabs voice cloning at $5/mo vs hiring voice talent (id: reel-elevenlabs-voice-clone-5-dollars)
