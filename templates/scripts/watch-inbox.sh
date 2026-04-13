#!/bin/bash
# watch-inbox.sh — Monitor inbox/messages/pending/ for new messages.
# Moves processed messages to inbox/messages/done/ or inbox/messages/failed/.

PALACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PENDING="$PALACE_ROOT/inbox/messages/pending"
DONE="$PALACE_ROOT/inbox/messages/done"
FAILED="$PALACE_ROOT/inbox/messages/failed"

if [ ! -d "$PENDING" ]; then
  echo "No pending directory found at $PENDING"
  exit 1
fi

count=0
for msg in "$PENDING"/*.md; do
  [ -f "$msg" ] || continue
  filename="$(basename "$msg")"
  echo "Processing: $filename"
  # Move to done (override with custom processing logic as needed)
  mv "$msg" "$DONE/$filename"
  count=$((count + 1))
done

echo "Processed $count message(s)."
