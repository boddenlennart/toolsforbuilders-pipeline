# @toolsforbuilders Instagram Pipeline

Fully automated Instagram content pipeline for the @toolsforbuilders account.

## Overview

This pipeline handles:
1. **Research** — Multi-source trend research (RSS feeds + Brave Search + Claude synthesis)
2. **Content Generation** — AI-powered carousel posts and captions
3. **Image Generation** — On-brand slide images (1080x1080)
4. **Approval Workflow** — Telegram approval before posting
5. **Instagram Posting** — Carousel publishing via Graph API
6. **Token Management** — Monthly token refresh

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure .env.secrets

Add these to `.env.secrets`:
```bash
# Already configured
IG_APP_ID=...
IG_APP_SECRET=...
IG_USER_ID=34200011856280132
IG_USERNAME=toolsforbuilders
IG_ACCESS_TOKEN=...

# NEEDS TO BE ADDED:
ANTHROPIC_API_KEY=sk-ant-...   # For Claude content generation
TG_CHAT_ID=...                  # Lennart's Telegram chat ID for approvals
```

**Get Lennart's Telegram chat ID:**
Send any message to the bot, then check:
```bash
curl "https://api.telegram.org/bot8261416147:AAEH8tIatc3KOF99Yozm8kCu-mx3fQgM-x8/getUpdates" | jq '.result[-1].message.chat.id'
```

### 3. Register PM2 processes
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## Scripts

| Script | Purpose | Schedule |
|--------|---------|----------|
| `research-trends.mjs` | Multi-source trend research | Sundays 9AM ICT |
| `generate-content.mjs` | Generate carousel posts via Claude | On-demand |
| `generate-images.mjs` | Create branded slide images | On-demand |
| `post-to-instagram.mjs` | Publish to Instagram | After approval |
| `approval-bot.mjs` | Send posts to Telegram for approval | Daily 9AM ICT |
| `daily-post.mjs` | **Main orchestrator** | Daily 9AM ICT |
| `refresh-token.mjs` | Refresh Instagram token | Monthly |

## Manual Workflow

```bash
# 1. Run research (weekly)
npm run research

# 2. Generate content
npm run generate

# 3. Generate images
npm run images

# 4. Send for approval (sends to Telegram)
npm run approve

# 5. After Telegram approval, post goes live automatically
```

## Daily Orchestrator

The `daily-post.mjs` script handles everything automatically:
- Checks if content queue is low → generates new content
- Checks for missing images → generates them
- Picks today's post (rotating pillars, no repeats)
- Sends to Telegram for approval
- Posts after approval

**PM2 cron:** `0 2 * * *` (2:00 AM UTC = 9:00 AM Bangkok)

## Brand Identity

- **Primary:** Electric Blue `#0066FF`
- **Background:** Cream `#F5F5F0`
- **Text:** Charcoal `#1A1A1A`
- **Accents:** Lime `#BFFF00`, Purple `#8B5CF6` (sparingly)
- **Style:** High contrast, clean, information-dense

## File Structure

```
scripts/instagram/
├── .env.secrets          # API keys (gitignored)
├── package.json
├── ecosystem.config.cjs  # PM2 configuration
├── utils.mjs             # Shared utilities
├── research-trends.mjs   # RSS + Brave + Claude research
├── generate-content.mjs  # Content generation
├── generate-images.mjs   # Image generation
├── post-to-instagram.mjs # Instagram API posting
├── approval-bot.mjs      # Telegram approval workflow
├── daily-post.mjs        # Main orchestrator
├── refresh-token.mjs     # Token refresh
└── data/
    ├── weekly-trends.json    # Research output
    ├── content-queue.json    # Post queue
    ├── post-log.json         # Posting history
    └── posts/
        └── YYYY-MM-DD/       # Generated images
```

## Image Hosting ⚠️ IMPORTANT

**Instagram's Content Publishing API requires images at publicly accessible URLs with valid SSL certificates.**

The Tailscale IP (`100.105.60.33`) is not accessible from Instagram's servers.

### Options:

1. **Cloudflare R2** (recommended)
   - Create R2 bucket with public access
   - Add to `.env.secrets`: `IG_IMAGE_BASE_URL=https://pub-xxx.r2.dev/ig-posts`
   - Update `generate-images.mjs` to upload to R2 instead of local

2. **AWS S3**
   - Create public S3 bucket
   - Add: `IG_IMAGE_BASE_URL=https://bucket.s3.region.amazonaws.com/ig-posts`

3. **ngrok** (testing only)
   ```bash
   ngrok http 3000
   # Then add: IG_IMAGE_BASE_URL=https://xxx.ngrok.io/ig-posts
   ```

4. **Cloudflare Tunnel** (permanent)
   - Set up tunnel to Life Dashboard
   - Use tunnel URL as image base

### Current Status
Images are generated locally to `/root/.openclaw/workspace/life-dash/public/ig-posts/`.
You need to configure `IG_IMAGE_BASE_URL` in `.env.secrets` pointing to a public CDN.

## RSS Feed Sources

| Source | Priority | Content |
|--------|----------|---------|
| Product Hunt | High | New tool launches (gold mine) |
| Hacker News | High | Builder community signal |
| Ben's Bites | High | Daily AI newsletter |
| TechCrunch | Medium | Funding, product news |
| VentureBeat AI | Medium | AI/ML coverage |
| The Next Web | Low | Tools + startup coverage |

## Troubleshooting

**"ANTHROPIC_API_KEY not found"**
Add your Claude API key to `.env.secrets`

**"TG_CHAT_ID not set"**
Get Lennart's chat ID from Telegram bot updates (see Setup)

**Images not accessible**
Check that Life Dashboard (PM2: `life-dash`) is running on port 3000

**Instagram API errors**
Check token expiry. Run `npm run refresh` or get a new token from Meta Developer Portal.

---

Last updated: 2026-03-03
