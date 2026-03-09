# Knowledge Base System — @toolsforbuilders

This document explains the knowledge base (KB) system for the @toolsforbuilders Instagram content pipeline.

## Overview

The KB system provides:
1. **Per-tool markdown files** with facts, verified claims, and banned claims
2. **Staleness tracking** — each file has a `last_verified` date
3. **Weekly verification** — automated searches flag discrepancies for human review
4. **Quality gate integration** — content drafts are checked against KB before Telegram approval

## File Structure

```
scripts/instagram/
├── quality-gate.mjs        # Content quality checker
├── kb-loader.mjs           # Load and query KB files
├── kb-updater.mjs          # Re-verify facts via web search
├── kb-weekly-update.mjs    # Cron-ready weekly workflow
├── migrate-kb.mjs          # One-time migration (already run)
└── data/
    ├── knowledge-base.json # Legacy monolithic KB (reference only)
    └── kb/
        ├── claude.md
        ├── gemini.md
        ├── notebooklm.md
        └── capcut.md
```

## KB File Format

Each tool has a markdown file at `data/kb/{slug}.md`:

```markdown
---
tool: Claude
slug: claude
last_verified: 2026-03-03
source_url: https://claude.ai/pricing
---

## Facts
- free_tier: Limited messages per day (~40), 5-hour reset windows
- paid_tier: Claude Pro $20/mo
...

## Verified claims (use these in content)
- "~40 messages per day on the free tier, resets every 5 hours"
- "Sonnet 4.6 is the new default for free/Pro users"

## Banned claims (do not use — unverified or outdated)
- "Best AI for [task]" — superlative, unverified
- "Saves X hours" — unless tested with specific workflow
```

## Quality Gate

The quality gate (`quality-gate.mjs`) checks content scripts before sending for Telegram approval.

### Hard Blocks (reject entirely)
| ID | Rule |
|---|---|
| HB-1 | Unverifiable superlative ("best", "fastest", "only" without citation) |
| HB-2 | Tool name/feature not found in KB |
| HB-3 | Invented stats (numbers not traceable to KB or verified source) |
| HB-4 | Feature described without workflow context |
| HB-5 | Vague outcome claim ("save time" without specifics) |

### Soft Blocks (warn, let Lennart decide)
| ID | Rule |
|---|---|
| SB-1 | Em dash used as connector |
| SB-2 | Hedge language ("might", "could potentially") |
| SB-3 | Slide has fewer than 3 actionable bullets |
| SB-4 | No specific number anywhere in script |
| SB-5 | CTA does not include "save this" variant |

### Usage

```bash
# CLI
node quality-gate.mjs data/scripts/reel-research-workflow.json

# Module
import { checkQuality } from './quality-gate.mjs';
const result = await checkQuality(scriptObject);
// result = { passed: bool, hardBlocks: [], softBlocks: [], report: string }
```

## KB Management

### Check Tool Facts

```bash
node kb-loader.mjs --get claude
node kb-loader.mjs --list
node kb-loader.mjs --check-stale
```

### Update KB (Manual)

```bash
# Update all stale tools (>14 days since verified)
node kb-updater.mjs

# Force update specific tool
node kb-updater.mjs --tool claude

# Update all tools
node kb-updater.mjs --all

# Preview without running searches
node kb-updater.mjs --dry-run

# Update last_verified dates for clean tools
node kb-updater.mjs --all --update-dates
```

### Weekly Automated Update

The weekly update runs every Sunday at 8AM Bangkok time (1AM UTC).

**What it does:**
1. Searches Brave for "[tool name] free tier limits [month year]"
2. Compares results to current KB facts
3. Flags discrepancies (does NOT auto-update)
4. Sends report to Telegram (group -1003879867373, topic 6)

**Cron setup:**

```bash
# Edit crontab
crontab -e

# Add this line
0 1 * * 0 /usr/bin/node /root/.openclaw/workspace/scripts/instagram/kb-weekly-update.mjs >> /var/log/kb-weekly.log 2>&1
```

**Manual test:**

```bash
# Full run with Telegram notification
node kb-weekly-update.mjs

# Preview without sending to Telegram
node kb-weekly-update.mjs --dry-run
```

## Workflow Integration

### Content Generation Pipeline

```
1. Generate script draft (via AI)
         ↓
2. Run quality gate: checkQuality(script)
         ↓
   HARD BLOCK? → Reject, log error, do not send
         ↓
   SOFT BLOCK? → Include warnings in Telegram message
         ↓
3. Send to Telegram for Lennart approval
         ↓
4. Approved → Post to Instagram
```

### Adding a New Tool

1. Create `data/kb/{slug}.md` with the standard format
2. Fill in facts from official sources
3. Add verified claims (things safe to use in content)
4. Add banned claims (things to avoid)
5. Test: `node kb-loader.mjs --get {slug}`

### Updating Tool Facts

1. Run: `node kb-updater.mjs --tool {slug}`
2. Review discrepancies in output
3. Manually update `data/kb/{slug}.md`
4. Update `last_verified` date
5. Commit changes

## Secrets

All API keys are in `.env.secrets`:

| Key | Used by |
|---|---|
| BRAVE_API_KEY | kb-updater.mjs, kb-weekly-update.mjs |
| TG_BOT_TOKEN | kb-weekly-update.mjs |

## Staleness Policy

- **Fresh:** Verified within last 14 days
- **Stale:** More than 14 days since verification
- **Weekly check:** Sundays at 8AM Bangkok (1AM UTC)

Tools become stale automatically. The weekly update flags them. Lennart reviews and approves updates manually.

## Example: Running Quality Gate

```bash
$ node quality-gate.mjs data/scripts/reel-research-workflow.json

# Quality Gate Report

**Script:** reel-research-workflow-v1
**Status:** ✅ PASSED

## ⚠️ Soft Blocks (review recommended)

### SB-1: Em dash used as connector
- **hookSub**: "And it finds angles your competitors missed." → —

---
*Script passed but has 1 soft warnings. Review recommended before posting.*
```

---

*Last updated: March 2026*
