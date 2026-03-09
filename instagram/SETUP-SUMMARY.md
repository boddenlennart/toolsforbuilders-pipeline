# Instagram Pipeline — Setup Summary

**Built:** 2026-03-03

## ✅ What's Done

### Scripts Created (7 total)
| Script | Status | Test Result |
|--------|--------|-------------|
| `utils.mjs` | ✅ Complete | Shared utilities working |
| `research-trends.mjs` | ✅ Complete | RSS feeds parsed, Brave validation works |
| `generate-content.mjs` | ✅ Complete | Needs ANTHROPIC_API_KEY |
| `generate-images.mjs` | ✅ Complete | Test images generated successfully |
| `post-to-instagram.mjs` | ✅ Complete | Needs public image hosting |
| `approval-bot.mjs` | ✅ Complete | Needs TG_CHAT_ID |
| `daily-post.mjs` | ✅ Complete | Orchestrator ready |
| `refresh-token.mjs` | ✅ Complete | Token refresh logic ready |

### Verified Working
- ✅ npm dependencies installed (canvas, rss-parser, dotenv)
- ✅ Instagram API authentication (token valid, account: @toolsforbuilders)
- ✅ Image generation (1080x1080 branded slides)
- ✅ RSS feed parsing (Product Hunt, HN, TechCrunch, VentureBeat)
- ✅ Brave Search API validation
- ✅ PM2 ecosystem config created

## ⚠️ Needs Manual Setup

### 1. Add API Keys to .env.secrets
```bash
# Already present:
IG_APP_ID=26562199456718718
IG_APP_SECRET=8d9ff9178af397f6c8473bde22aef9bd
IG_USER_ID=34200011856280132
IG_USERNAME=toolsforbuilders
IG_ACCESS_TOKEN=IGAALu...

# ADD THESE:
ANTHROPIC_API_KEY=sk-ant-api03-...  # For Claude content generation
TG_CHAT_ID=123456789                 # Lennart's Telegram chat ID
IG_IMAGE_BASE_URL=https://...        # Public CDN for images (see below)
```

### 2. Set Up Public Image Hosting

**Problem:** Instagram API requires images at publicly accessible HTTPS URLs.
Current server uses Tailscale (private) and self-signed SSL (rejected).

**Recommended Solution: Cloudflare R2**
1. Create Cloudflare R2 bucket
2. Enable public access
3. Add to .env.secrets: `IG_IMAGE_BASE_URL=https://pub-xxx.r2.dev/ig-posts`
4. Modify `generate-images.mjs` to upload to R2 (or create upload script)

**Alternative: Cloudflare Tunnel**
1. `cloudflared tunnel create ig-images`
2. Route to `http://localhost:3000`
3. Use tunnel URL as image base

### 3. Get Telegram Chat ID
```bash
# Send any message to the bot, then:
curl "https://api.telegram.org/bot8261416147:AAEH8tIatc3KOF99Yozm8kCu-mx3fQgM-x8/getUpdates" | jq '.result[-1].message.chat.id'
```

### 4. Register PM2 Crons
```bash
cd /root/.openclaw/workspace/scripts/instagram
pm2 start ecosystem.config.cjs
pm2 save
```

## 📁 File Structure
```
scripts/instagram/
├── .env.secrets          # API keys (needs additions)
├── package.json
├── ecosystem.config.cjs  # PM2 cron config
├── utils.mjs
├── research-trends.mjs   # Multi-source research
├── generate-content.mjs  # Claude content gen
├── generate-images.mjs   # Branded slides
├── post-to-instagram.mjs # IG API posting
├── approval-bot.mjs      # Telegram approval
├── daily-post.mjs        # Main orchestrator
├── refresh-token.mjs     # Token management
├── README.md
├── SETUP-SUMMARY.md
└── data/
    ├── weekly-trends.json    # Research output (generated)
    ├── content-queue.json    # Post queue
    ├── post-log.json         # History
    └── posts/test/           # Test images (working)
```

## 🔄 Workflow Once Set Up

**Weekly (Sundays):**
1. `research-trends.mjs` runs automatically via PM2 cron
2. Fetches RSS + validates via Brave + synthesizes with Claude

**Daily (9 AM Bangkok):**
1. `daily-post.mjs` runs automatically
2. Checks queue → generates content if low
3. Generates images if missing
4. Sends to Telegram for approval
5. On approval → posts to Instagram

**Monthly:**
1. `refresh-token.mjs` refreshes Instagram token

## 🧪 Test Commands

```bash
# Test image generation
npm run images -- --test

# Run research manually
npm run research

# Generate content (needs ANTHROPIC_API_KEY)
npm run generate

# Send approval request (needs TG_CHAT_ID)
npm run approve

# Dry run daily orchestrator
node daily-post.mjs --dry-run
```

## ⏭️ Next Steps (Priority Order)

1. **Set up Cloudflare R2** for image hosting
2. **Add ANTHROPIC_API_KEY** to .env.secrets
3. **Get TG_CHAT_ID** from Telegram
4. **Test full workflow** end-to-end
5. **Register PM2 crons** for automation
