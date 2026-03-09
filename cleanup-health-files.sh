#!/bin/bash
# cleanup-health-files.sh
# Deletes raw Apple Watch health dump files older than 7 days.
# Data is already imported into SQLite — raw files serve no purpose after that.

HEALTH_DIR="/root/.openclaw/workspace/data/health"
KEEP_DAYS=7
LOG_PREFIX="[cleanup-health $(date '+%Y-%m-%d %H:%M')]"

if [ ! -d "$HEALTH_DIR" ]; then
  echo "$LOG_PREFIX Directory not found: $HEALTH_DIR"
  exit 0
fi

# Find and delete files older than KEEP_DAYS
DELETED=0
FREED=0

while IFS= read -r file; do
  SIZE=$(du -sh "$file" 2>/dev/null | cut -f1)
  rm -f "$file"
  echo "$LOG_PREFIX Deleted: $(basename "$file") ($SIZE)"
  ((DELETED++))
done < <(find "$HEALTH_DIR" -maxdepth 1 -type f \( -name "*.json" -o -name "*-raw.txt" \) -mtime +$KEEP_DAYS)

if [ "$DELETED" -eq 0 ]; then
  echo "$LOG_PREFIX Nothing to clean up (all files within $KEEP_DAYS days)"
else
  REMAINING=$(du -sh "$HEALTH_DIR" 2>/dev/null | cut -f1)
  echo "$LOG_PREFIX Done — removed $DELETED file(s). Health dir now: $REMAINING"
fi
