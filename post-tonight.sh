#!/bin/bash
# One-shot: post the approved n8n vs Make reel
cd /root/.openclaw/workspace/scripts

VIDEO="/root/.openclaw/workspace/scripts/instagram/data/samples/reels/reel-2026-03-08T12-19-43.mp4"
SCRIPT_ID="reel-n8n-vs-make-cost"

echo "$(date -u) — Starting post for $SCRIPT_ID"
node post-approved-reel.mjs "$VIDEO" "$SCRIPT_ID" 2>&1

# Remove this cron after running
openclaw cron remove post-tonight-reel 2>/dev/null || true
echo "$(date -u) — Done"
