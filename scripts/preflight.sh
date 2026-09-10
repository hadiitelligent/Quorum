#!/usr/bin/env bash
# Everything that must pass before a deploy reaches production.
#
# Runs automatically: npm's `predeploy` hook means `npm run deploy` executes
# this first and refuses to deploy if it exits non-zero.
#
#   npm run preflight               run them on demand
#   SKIP_DB_TEST=1 npm run deploy   emergency hatch, see below
#
# The database suite needs a local Postgres. On a machine without one it
# fails and names the override rather than silently skipping.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

failed=0
run() {
  local label="$1"; shift
  printf '\n\033[1m→ %s\033[0m\n' "$label"
  if "$@"; then
    printf '\033[32m  ok\033[0m\n'
  else
    printf '\033[31m  FAILED\033[0m\n'
    failed=1
  fi
}

run "types"      npm run --silent typecheck
run "lint"       npm run --silent lint
run "unit tests" npm run --silent test:unit

if [ "${SKIP_DB_TEST:-}" = "1" ]; then
  printf '\n\033[33m→ database suite SKIPPED (SKIP_DB_TEST=1)\033[0m\n'
  printf '  The permission matrix, the private chats and the session record are unverified.\n'
else
  run "database suite" npm run --silent db:test
fi

echo ""
if [ "$failed" -ne 0 ]; then
  echo "Preflight failed. Nothing has been deployed."
  echo "Fix the above, or — only if production is broken and this is the fix —"
  echo "re-run with SKIP_DB_TEST=1 to skip just the database suite."
  exit 1
fi
echo "Preflight passed."
