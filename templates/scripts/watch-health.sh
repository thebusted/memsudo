#!/bin/bash
# watch-health.sh — Quick health check for a memsudo palace.
# Verifies required files and directories exist.
#
# Optional: set MEMSUDO_HEALTH_HOST to enable remote health endpoint check.
# If not set, only local palace structure is verified.

PALACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

errors=0

check_file() {
  if [ ! -f "$PALACE_ROOT/$1" ]; then
    echo "MISSING: $1"
    errors=$((errors + 1))
  fi
}

check_dir() {
  if [ ! -d "$PALACE_ROOT/$1" ]; then
    echo "MISSING: $1/"
    errors=$((errors + 1))
  fi
}

check_file "INDEX.md"
check_file "CLAUDE.md"
check_file ".gitignore"
check_dir "areas"
check_dir "lab"
check_dir "incubate"
check_dir "memory"
check_dir "inbox"
check_dir "outbox"
check_dir "archive"
check_dir ".secrets"

# Optional remote health check
if [ -n "$MEMSUDO_HEALTH_HOST" ]; then
  status=$(curl -s -o /dev/null -w "%{http_code}" "$MEMSUDO_HEALTH_HOST/health" 2>/dev/null)
  if [ "$status" != "200" ]; then
    echo "REMOTE: $MEMSUDO_HEALTH_HOST returned $status"
    errors=$((errors + 1))
  fi
fi

if [ $errors -eq 0 ]; then
  echo "Palace health: OK"
else
  echo "Palace health: $errors issue(s) found"
  exit 1
fi
