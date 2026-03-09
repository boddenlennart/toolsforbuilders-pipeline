#!/bin/bash
# Automatic model failover + recovery
# Usage: model-failover.sh [check|failover|recover|status]

OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
AUTH_FILE="$HOME/.openclaw/agents/main/agent/auth-profiles.json"
FAILOVER_STATE="/tmp/model-failover-state"
PRIMARY_MODEL="anthropic/claude-sonnet-4-6"
BACKUP_MODEL="openrouter/deepseek/deepseek-r1-0528"
TELEGRAM_TOKEN=$(cat $OPENCLAW_CONFIG | python3 -c "import json,sys; print(json.load(sys.stdin)['channels']['telegram']['botToken'])")
CHAT_ID="2046511634"
ANTHROPIC_TOKEN=$(cat $AUTH_FILE | python3 -c "import json,sys; print(json.load(sys.stdin)['profiles']['anthropic:default']['token'])")

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$1\",\"parse_mode\":\"Markdown\"}" > /dev/null
}

get_current_model() {
  openclaw config get agents.defaults.model.primary 2>/dev/null | tr -d '"'
}

set_model() {
  openclaw config set agents.defaults.model.primary "$1" 2>/dev/null
  openclaw gateway restart 2>/dev/null &
  sleep 3
}

test_anthropic() {
  # Minimal test call to Anthropic API
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    -X POST "https://api.anthropic.com/v1/messages" \
    -H "x-api-key: $ANTHROPIC_TOKEN" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')
  echo $HTTP_CODE
}

case "${1:-check}" in

  "failover")
    echo "$(date): Initiating failover to $BACKUP_MODEL" >> /tmp/failover.log
    echo "BACKUP" > $FAILOVER_STATE
    set_model "$BACKUP_MODEL"
    send_telegram "⚠️ *Anthropic rate limit hit.*
Switched to backup model: DeepSeek R1 (OpenRouter)
Checking every 30 min for recovery.
I'll switch back to Claude automatically when it's available."
    ;;

  "check-recovery")
    # Only run if we're on backup
    if [ ! -f "$FAILOVER_STATE" ] || [ "$(cat $FAILOVER_STATE)" != "BACKUP" ]; then
      echo "Not in failover state, skipping recovery check"
      exit 0
    fi

    echo "$(date): Testing Anthropic availability..." >> /tmp/failover.log
    HTTP_CODE=$(test_anthropic)
    echo "$(date): Anthropic returned HTTP $HTTP_CODE" >> /tmp/failover.log

    if [ "$HTTP_CODE" = "200" ]; then
      echo "$(date): Anthropic recovered! Switching back." >> /tmp/failover.log
      rm -f $FAILOVER_STATE
      set_model "$PRIMARY_MODEL"
      send_telegram "✅ *Anthropic is back online.*
Switched back to Claude Sonnet 4.6.
All systems normal."
    else
      echo "$(date): Anthropic still unavailable (HTTP $HTTP_CODE), staying on backup." >> /tmp/failover.log
    fi
    ;;

  "status")
    CURRENT=$(get_current_model)
    STATE=$(cat $FAILOVER_STATE 2>/dev/null || echo "PRIMARY")
    echo "Current model: $CURRENT"
    echo "Failover state: $STATE"
    ;;

esac
