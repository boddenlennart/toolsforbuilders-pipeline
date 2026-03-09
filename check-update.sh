#!/bin/bash
# Daily OpenClaw update checker
# Pings Lennart if a new version is available

OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
TELEGRAM_TOKEN=$(cat $OPENCLAW_CONFIG | python3 -c "import json,sys; print(json.load(sys.stdin)['channels']['telegram']['botToken'])")
CHAT_ID="2046511634"

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$1\",\"parse_mode\":\"Markdown\"}" > /dev/null
}

# Get update status
STATUS=$(openclaw update status --json 2>/dev/null || openclaw update status 2>&1)
CURRENT=$(openclaw --version 2>/dev/null)

# Check if update is available (looks for "available" but NOT "latest")
# "available" = new version ready | "latest" = already up to date
if echo "$STATUS" | grep -qi "available" && ! echo "$STATUS" | grep -qi "latest"; then
  NEW_VERSION=$(echo "$STATUS" | grep -oP '\d{4}\.\d+\.\d+-\d+' | tail -1)
  send_telegram "🦞 *OpenClaw Update Available*

Current: \`$CURRENT\`
New: \`$NEW_VERSION\`

Reply *'update openclaw'* and I'll install it for you."
  echo "$(date): Update available ($CURRENT → $NEW_VERSION), notification sent."
else
  echo "$(date): Already on latest version ($CURRENT), no notification sent."
fi
