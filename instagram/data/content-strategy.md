# Content Strategy — @toolsforbuilders
# THIS FILE IS INJECTED INTO EVERY CONTENT GENERATION PROMPT
# Read it fully before producing any slide content, script, or hook.

---

## The Single Rule

**Workflow over tools. Always.**

Every piece of content must teach the viewer *what to do*, not *what exists*.
A tool description is not content. A workflow that uses that tool is content.

---

## The Value Test (mandatory before every draft)

Ask this before writing a single word:

> "Would a solopreneur screenshot this or save this to come back to on Monday morning?"

If the answer is no — reframe. Do not produce the draft until it passes.

**Fails the test:**
- "Claude has a free tier with ~40 messages/day"
- "NotebookLM lets you upload 50 sources"
- "Gemini is the same model as Google One AI"

**Passes the test:**
- "Here's how to use NotebookLM to find the content angle your competitors missed"
- "This is the exact order to use these 3 tools to go from blank page to published post"
- "Most solopreneurs research for 2 hours before writing. This workflow cuts it to 20 minutes"

The difference: the first set describes. The second set instructs.

---

## Content Hierarchy (use in this order, don't skip ahead)

1. **Workflow walkthrough** — step-by-step process with named tools, specific order, time estimate
2. **Specific comparison** — Tool A vs Tool B for a specific task, with a clear winner and reason why
3. **Contrarian take** — challenge a common assumption with a specific, verifiable counter-claim
4. **Hidden feature spotlight** — one underused feature that unlocks a specific workflow
5. **Tool introduction** (last resort) — only if the tool is genuinely unknown AND paired with a workflow

Never lead with a tool introduction unless it scores 9/10 on the value test.

---

## Hook Formula Library

Every hook must create a **knowledge gap** — the viewer must feel they're missing something specific.

### Formula 1 — Time Compression
```
"Most solopreneurs spend [X hours] on [task]. This workflow cuts it to [Y minutes]."
```
Works because: specific time claim + implies the viewer is wasting time.

### Formula 2 — Contrarian Claim
```
"[Common tool/approach] is the wrong way to [task]. Here's what actually works."
```
Works because: challenges existing behavior, forces the viewer to wonder if they're doing it wrong.

### Formula 3 — Specific Outcome
```
"I [specific result] in [specific time] using only [constraint — free/one tool/etc]."
```
Works because: concrete proof, replicable, viewer imagines doing the same.

### Formula 4 — Hidden Knowledge
```
"There's a [tool/feature/workflow] that almost nobody uses for [common task]. It's the best one."
```
Works because: implies the viewer is missing something others know.

### Formula 5 — Number Hook
```
"[Specific number] solopreneurs are [doing X wrong/paying for Y unnecessarily]. Here's the fix."
```
Works because: social proof + problem identification + implied solution.

### Formula 6 — Comparison (REQUIRED for Comparison pillar)
```
[Tool A]: [specific metric — cost/limit/time].
[Tool B]: [contrasting metric].
[One-line payoff that makes the winner obvious without stating it.]
```
Works because: parallel structure forces instant comparison, specific numbers create credibility, the implied conclusion pulls the viewer in.

**Comparison hook rules (mandatory):**
- BOTH tool names must appear in `hookHeadline` (visual) AND `hookTTS` (spoken) — no exceptions
- State the concrete metric for each tool (price, credit limit, execution count, time)
- The recommended/winning tool must be named by the end of `hookTTS`
- Never open a Comparison reel talking only about the losing tool

**Add to Banned hook patterns (Comparison-specific):**
- Any Comparison hook that names only ONE tool → automatic hard block (HB-7)
- "Here's why [Tool A] is better" without stating what [Tool B] costs/does → vague
- Opening a Comparison with a pricing tier name without naming the competing tool

**Banned hook patterns:**
- "In this video I'll show you..." (filler, not a hook)
- "Today we're talking about..." (zero tension)
- "Did you know that..." (weak, overused)
- Any hook that could apply to 100 other videos

---

## Slide Value Rules

Every slide must answer: **"So what do I do with this?"**

### Hook slide
- Must name a specific problem or claim within 10 words
- Must create immediate tension — the viewer must feel they're about to learn something they didn't know

### Agitate slide
- Make the cost of the problem real — time, money, or missed opportunity
- One specific number or comparison if possible

### Content slides (3 of them)
- Each slide = one step in a workflow OR one specific insight
- Lead with the ACTION, not the tool: "Upload your competitors' top 5 posts" not "NotebookLM has an upload feature"
- Every bullet must be actionable: starts with a verb or specific outcome
- If a bullet just describes a feature → delete it and replace with what you DO with that feature

### Proof slide
- Show the outcome, not the process
- Specific number: time saved, money saved, output produced
- Must be verifiable — never invent stats

### CTA slide
- "Save this" as the primary ask — saves signal value to the algorithm
- Secondary: follow for more of the same type of content (not generic "follow for tips")

---

## Banned Content Patterns

These patterns will be rejected by the quality gate. Do not produce them.

❌ **Feature lists** — "Tool X can do A, B, and C" with no workflow context
❌ **Pricing comparisons without workflow** — "This is free vs $20/mo" as the main value
❌ **Vague outcomes** — "save time", "be more productive", "work smarter" — always specify HOW MUCH and ON WHAT
❌ **Superlatives without proof** — "best", "fastest", "most powerful" — always back with a specific claim
❌ **Generic AI content** — anything that could appear on any AI newsletter unchanged
❌ **Em dashes as connectors** — rewrite as natural sentences (AI writing tell)
❌ **Hedging language** — "might", "could potentially", "some people say" — be direct
❌ **Tool introductions without workflows** — describing what a tool is without showing what to DO with it

---

## Content Pillars (rotate through these)

1. **Workflow** — step-by-step process using the $0 stack
2. **Time/Money Math** — specific savings calculation for a specific task
3. **Hidden Feature** — underused capability + the workflow it enables
4. **Comparison** — two approaches to the same task, clear winner with reasoning
5. **Myth Bust** — common belief about AI tools that is wrong, with a specific correction

Aim for: 2x workflow per week, 1x comparison, 1x hidden feature, 1x myth bust.

---

## Target Audience Calibration

**Who they are:** Solopreneurs who are AI-curious but not AI-expert. They've heard of ChatGPT. They may have tried it. They're not following AI benchmarks or model releases. They want practical help with real business tasks: content creation, research, client communication, admin.

**What they already know:** ChatGPT exists. AI can write stuff. Some tools are free.

**What they don't know:** Specific workflows that combine tools. Which tool is actually better for which specific task. How to get consistent, usable output from AI without spending hours prompting.

**The content gap we fill:** The gap between "I know AI exists" and "I actually use AI to save 10 hours a week."

---

## Self-Check Before Producing Any Draft

Run through this list. If any answer is "no", rewrite before sending.

- [ ] Does the hook create a knowledge gap within 10 words?
- [ ] Does every content slide tell the viewer what to DO, not just what exists?
- [ ] Could a solopreneur watch this and replicate the workflow immediately?
- [ ] Is there a specific number somewhere (time, money, output quantity)?
- [ ] Does the CTA say "save this" and explain what they'll get if they follow?
- [ ] Are there zero em dashes used as connectors?
- [ ] Are there zero vague outcome claims ("save time", "be productive")?
- [ ] Does the content pass: "would I have known this before researching it specifically"?

---

*Last updated: March 2026*
*Inject this file into all content generation prompts before producing slides or scripts.*

---

## Video Length Rules (MANDATORY)

**Target: 40-50 seconds. Hard limit: 55 seconds.**

Platform limits: TikTok 60s, YouTube Shorts 60s, Instagram Reels 90s.
Completion rate is the #1 algorithm signal on all three platforms.
A 45-second video with 85% completion beats a 65-second video with 50% completion every time.

**TTS script rules:**
- MAX 28 words per segment (calibrated from Eric voice; complex content slides speak at ~2.08 w/s)
- One idea per segment — no padding, no filler
- Hook: state the tension clearly, with enough detail to feel real
- Each workflow step: tool name + what to DO + why it matters
- CTA: one clear action + one reason to follow
- Total word count across all 7 segments: MAX 125 words (calibrated from Eric voice at 2.30 w/s avg; 125 words ≈ 47s with natural pacing variation)
- Do NOT strip narration to the point it sounds like a bullet list read aloud

**If the generated video exceeds 55 seconds: trim the TTS scripts, do not reduce slide count.**

---

## Quality Gate — Opus Review Criteria (applied to all content)

These rules come from a full content audit. Apply them to every reel before generating.

### Hook (mandatory)
- Must create **contrast AND stakes** in one breath — not just a statement
- First-person voice preferred: "You're doing X. I do Y." beats "Most people do X."
- Pattern: `[What viewer is doing] → [contrasting better outcome]`
- ❌ Weak: "Most solopreneurs spend 3 hours researching." (statement)
- ✅ Strong: "You're spending 3 hours on research. I do it in 20 minutes and find angles you missed."

### Step/Middle Slides (mandatory)
- **Every step must have at least one specific, concrete detail** — a number, a prompt snippet, a named constraint, a time estimate
- ❌ Weak: "Tell Claude what you need."
- ✅ Strong: "Tell Claude: eight hundred words, no intro fluff, lead with the contrarian take."
- When 3+ tool steps follow in a row, **add a verbal pattern-break** before the last one
  - Formula: "Last step — and this is the one people skip."
  - This re-earns attention right when list fatigue hits

### Proof Slide (mandatory)
- **Match the angle of the reel — do NOT default to free tier.**
  - If the reel angle is "save money" → then free tier is relevant proof
  - If the reel angle is "save time" → proof should be time saved, not cost
  - If the reel angle is "paid tool worth it" → proof should be ROI or outcome, not "it's free"
  - If the reel angle is a workflow → proof should be the end result achieved
- "All free" as the default proof line is lazy and often irrelevant.
- ❌ Wrong angle: "Descript Overdub — all free." (it's not free, and that's not the point anyway)
- ✅ Right angle: "Descript Overdub — 20-min re-record → 30-second fix."
- Proof should surprise or reframe the value, not just confirm a feature exists.

### CTA (locked — use this template)
- **Standard CTA:** "Save this before you forget it. I drop one of these every day."
- Only deviate if a specific piece of content has a stronger native CTA (e.g. "DM me the word X")
- Never promise a specific posting frequency other than "every day"

### Scoring — Minimum Threshold to Post
Before any reel goes to approval, it must score 7/10+ across:

| Element | Minimum |
|---|---|
| Hook creates contrast + stakes | ✅ required |
| Steps have specific, concrete detail | ✅ required |
| Pattern-break before last step (if 3+ steps) | ✅ required |
| Proof surprises, doesn't just confirm | 7/10 |
| CTA matches approved template | ✅ required |

If any ✅ required item fails → rewrite before generating audio.

---

## TTS Voice Direction — Writing for Natural Speech

ElevenLabs cloned voices follow sentence structure and punctuation for intonation. Write scripts the way a voice actor would perform them — not the way you'd write an article.

### The Core Rule
**End every sentence on a word that resolves downward.** Cloned voices rise on ambiguous endings and fall on definitive ones.

**Problematic endings (voice goes up, sounds like a question):**
- Past tense verbs as final word: "...you missed." / "...they overlooked." / "...it replaced."
- Relative clauses hanging open: "...that no one covers." / "...that you need."
- Prepositions as final word: "...to look for." / "...to work with."

**Strong endings (voice falls naturally, sounds complete):**
- Adverbs of finality: "...entirely." / "...completely." / "...every time." / "...right now."
- Short declarative closes: "That's the gap." / "Here's how." / "That's it." / "Starting now."
- Strong nouns: "...that's the difference." / "...that's the workflow."

### Sentence Structure Rules
- **Short sentences close better than long ones.** Split any sentence over 20 words.
- **Use em dashes (—) for dramatic pauses**, not commas. The voice will breathe.
- **"And" at sentence start** works well for continuation — forces a natural downward lead-in.
- **Three-sentence rhythm** is natural for cloned voices: setup. conflict. resolution.
  - ✅ "You spend three hours researching. I do it in twenty. And my angles are different."
  - ❌ "You spend three hours researching but I do it in twenty minutes and find better angles."

### Punctuation = Direction
| Mark | Effect |
|---|---|
| `.` | Full stop. Voice falls. Use freely. |
| `—` | Pause, then emphasis on next phrase |
| `,` | Brief pause, voice stays elevated |
| `...` | Trailing off — use sparingly |
| `?` | Avoid in scripts — voice goes up and stays up |

### Never End a Slide On
- A question (even rhetorical)
- A word that ends in "-ed" as the final syllable
- A prepositional phrase ("...for you." / "...with it.")

### Test Before Generating
Read the TTS line aloud yourself. If your own voice goes up at the end — rewrite it.
