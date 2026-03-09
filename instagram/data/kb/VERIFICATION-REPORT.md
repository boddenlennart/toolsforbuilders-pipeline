# Knowledge Base Verification Report
**Generated:** 2026-03-04
**KB Version:** 4.0

## Summary
Rebuilt the knowledge base from scratch using web searches to verify all facts. No training data was used for pricing or model names.

---

## What Changed vs Old KB (v3.1)

### Claude
- **Updated:** Context window now verified as 1M tokens (beta) — previously listed as unverified
- **Updated:** Sonnet 4.6 confirmed as Feb 17, 2026 release
- **Updated:** Opus 4.6 release date confirmed as Feb 5, 2026
- **Updated:** Pricing verified: Pro $20/mo, Max 5x $100/mo, Max 20x $200/mo
- **New:** Annual pricing option: $200/year (~$16.67/mo)
- **New:** "Infinite Chats" feature documented
- **New:** Cowork integrations (Google Drive, Gmail, DocuSign, Intuit)
- **Removed:** "~40 messages per day" claim — limits are now conversation-window based
- **Confidence:** HIGH — multiple recent sources confirm

### Gemini
- **Updated:** Rebranded from "Gemini Advanced" to "Google AI Pro" — $19.99/mo (not $20)
- **Updated:** Free tier limits: 5-15 RPM, 100-1,000 RPD depending on model
- **New:** Google AI Ultra tier (~$125/3 months) documented
- **New:** Image generation limits verified: 100/day in App, 500-1,000/day in AI Studio
- **New:** Gemini 3.1 Pro released Feb 2026, 77.1% on ARC-AGI-2
- **Updated:** "1,500 requests/day" is specifically for Flash model, not all models
- **Confidence:** HIGH — multiple recent sources confirm

### NotebookLM
- **Confirmed:** Free tier remains completely free
- **Updated:** 50 sources per notebook on free tier
- **New:** NotebookLM Plus (600 sources) included in Google AI Pro — not standalone
- **New:** Video Overviews feature documented (added 2025)
- **Confirmed:** Audio Overviews expanded to 80+ languages
- **Confidence:** HIGH — sources consistent

### CapCut
- **MAJOR CHANGE:** Pricing restructured January 2026
- **Updated:** Pro pricing now varies significantly: $7.99-$19.99/mo depending on region
- **Updated:** Newsweek reports Pro at $19.99/mo after restructure
- **Conflict:** Some sources still cite $7.99/mo — using conservative estimate with range
- **Confirmed:** Free tier retains core features, watermarks on some templates
- **Confidence:** MEDIUM — pricing conflict between sources, used range

### ChatGPT
- **MAJOR CHANGE:** Free tier now shows ads (2026)
- **New:** Go tier introduced at $8/mo
- **New:** Pro Lite tier ($100/mo) announced as coming soon
- **Updated:** GPT-5.2 is current flagship (not GPT-5)
- **Confirmed:** Plus remains $20/mo
- **Confidence:** HIGH — multiple sources confirm

### Perplexity
- **Updated:** Free tier: unlimited basic searches, 5 Pro Searches/day
- **New:** Perplexity dropped ads entirely — now ad-free on all tiers
- **New:** Computer agent feature (browser automation) — Max tier only
- **New:** Daily attachment limit of 3 on free tier
- **Confirmed:** Pro remains $20/mo
- **Confidence:** HIGH — sources consistent

### n8n (New addition)
- **Added:** Complete KB file for n8n
- **Verified:** Self-hosted free, Cloud Starter $20/mo for 2,500 executions
- **Verified:** Native AI nodes for Claude/GPT/Gemini/Ollama
- **Note:** Self-hosting requires infrastructure (~$5-50/mo VPS)
- **Confidence:** HIGH — official pricing page + third-party analysis

### Make.com (New addition)
- **Added:** Complete KB file for Make.com
- **Verified:** Free tier 1,000 operations/month, 2 active scenarios
- **Verified:** Core plan ~$9-10.59/mo for 10,000 ops
- **Verified:** 3,000+ app integrations
- **Note:** Free tier "only for testing/learning" per third-party review
- **Confidence:** HIGH — multiple sources consistent

---

## What Couldn't Be Verified

### Pending verification (marked in files):
1. **CapCut exact Pro pricing:** Conflicting reports ($7.99 vs $19.99). Used range in KB.
2. **Claude free tier exact message limits:** Now conversation-window based, not daily count. Removed specific number.
3. **n8n Cloud Starter pricing:** Sources vary between $20-24/mo. Used $20/mo from primary sources.

### Requires future verification:
1. **ChatGPT Pro Lite:** Announced as "coming soon" — watch for launch
2. **Perplexity Computer:** Max tier only currently — watch for free tier rollout
3. **CapCut pricing stabilization:** Monitor if regional pricing normalizes

---

## Confidence Levels by Tool

| Tool | Confidence | Notes |
|------|------------|-------|
| Claude | HIGH | Multiple authoritative sources, recent releases well-documented |
| Gemini | HIGH | 9to5Google and official docs consistent |
| NotebookLM | HIGH | CNET, Wikipedia, and official sources agree |
| CapCut | MEDIUM | Pricing restructure caused confusion, used conservative range |
| ChatGPT | HIGH | Multiple tech publications confirm ads + new tiers |
| Perplexity | HIGH | G2, official pricing page consistent |
| n8n | HIGH | Official pricing + third-party analyses agree |
| Make.com | HIGH | Official pricing + third-party analyses agree |

---

## "$0 Stack" Math Verification

### What you're replacing:
- ChatGPT Plus: $20/mo
- Google AI Pro (Gemini): $19.99/mo
- CapCut Pro: ~$19.99/mo (upper range)

### Total potential savings: ~$60/mo

### What you get for $0:
- **Claude free:** Sonnet 4.6 (same model as Pro, limited usage)
- **Gemini free:** 100 images/day, 1,500 requests/day (Flash)
- **NotebookLM free:** Full features, 50 sources/notebook
- **CapCut free:** Core editing, AI captions, some watermarks

### Honest assessment:
The $0 Stack is viable for solopreneurs with moderate usage. Heavy users will hit limits and benefit from one paid upgrade. Recommended first upgrade: Claude Pro ($20/mo) for 5x usage.

---

## Sources Used

### Primary sources (official):
- claude.ai/pricing
- gemini.google.com
- notebooklm.google.com
- capcut.com/help/
- perplexity.ai/pricing
- n8n.io/pricing
- make.com/pricing

### Secondary sources (third-party verification):
- 9to5google.com (Gemini)
- screenapp.io (all tools)
- saascrmreview.com (pricing)
- CNET (NotebookLM)
- Newsweek (CapCut restructure)
- G2 (Perplexity)
- LaoZhang AI Blog (API limits)
- Wikipedia (NotebookLM, Claude)

---

## Recommendations for Content Team

1. **Always verify pricing before posting** — especially CapCut (regional variance)
2. **Date-stamp all pricing claims** — "as of March 2026"
3. **Avoid superlatives** — "best" requires benchmark citation
4. **Use the banned claims sections** — prevents embarrassing errors
5. **Refresh KB monthly** — AI tool landscape changes rapidly

---

*Report generated by research sub-agent. Last updated: 2026-03-04 04:30 UTC*
