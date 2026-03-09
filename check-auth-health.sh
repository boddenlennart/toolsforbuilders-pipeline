#!/bin/bash
# Auth & rate limit health check — triggers failover if needed

AUTH_FILE="$HOME/.openclaw/agents/main/agent/auth-profiles.json"
LOG_FILE="$HOME/.openclaw/logs/config-audit.jsonl"
FAILOVER_SCRIPT="/root/.openclaw/workspace/scripts/model-failover.sh"
FAILOVER_STATE="/tmp/model-failover-state"
TELEGRAM_TOKEN=$(cat $HOME/.openclaw/openclaw.json | python3 -c "import json,sys; print(json.load(sys.stdin)['channels']['telegram']['botToken'])")
CHAT_ID="2046511634"

send_alert() {
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$1\"}" > /dev/null
}

# Skip if already in failover
if [ -f "$FAILOVER_STATE" ] && [ "$(cat $FAILOVER_STATE)" = "BACKUP" ]; then
  echo "$(date): Already in failover mode, skipping health check"
  exit 0
fi

# Check error count in auth profile
ERROR_COUNT=$(cat "$AUTH_FILE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
stats=d.get('usageStats',{}).get('anthropic:default',{})
print(stats.get('errorCount',0))
" 2>/dev/null || echo 0)

# Check for rate limit keywords in recent gateway logs
RATE_HITS=0
if [ -f "$LOG_FILE" ]; then
  RATE_HITS=$(tail -200 "$LOG_FILE" | grep -ci "rate.limit\|429\|quota\|overloaded" 2>/dev/null || echo 0)
fi

# Trigger failover if issues detected
if [ "$ERROR_COUNT" -gt "3" ] 2>/dev/null || [ "$RATE_HITS" -gt "2" ] 2>/dev/null; then
  echo "$(date): Issues detected (errors: $ERROR_COUNT, rate hits: $RATE_HITS) — triggering failover" >> /tmp/auth-health.log
  bash "$FAILOVER_SCRIPT" failover
  exit 1
fi

echo "$(date): Auth health OK (errors: $ERROR_COUNT, rate hits: $RATE_HITS)"
exit 0
