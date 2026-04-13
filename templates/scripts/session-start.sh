#!/bin/bash
# session-start.sh — Run at the start of each Claude Code session.
# Installed by memsudo into linked repos via .claude/hooks.json.
#
# Reads memsudo.yaml from the repo root, finds the palace room,
# and prints the room's CLAUDE.md as system context.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
YAML_FILE="$REPO_ROOT/memsudo.yaml"

if [ ! -f "$YAML_FILE" ]; then
  exit 0
fi

# Parse palace and room from YAML (simple grep, no yq dependency)
PALACE=$(grep '^palace:' "$YAML_FILE" | sed 's/^palace:[[:space:]]*//')
ROOM=$(grep '^room:' "$YAML_FILE" | sed 's/^room:[[:space:]]*//')

if [ -z "$PALACE" ] || [ -z "$ROOM" ]; then
  exit 0
fi

CLAUDE_MD="$PALACE/$ROOM/CLAUDE.md"

if [ -f "$CLAUDE_MD" ]; then
  echo "--- memsudo room context ---"
  cat "$CLAUDE_MD"
  echo "--- end memsudo context ---"
fi
