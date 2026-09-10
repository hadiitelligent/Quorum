#!/usr/bin/env bash
# Checks the DEPLOYED site after `npm run deploy` (npm's postdeploy hook).
#
#   npm run smoke:live
#   BASE_URL=https://... npm run smoke:live
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BASE="${BASE_URL:-$(grep -E '^APP_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2-)}"
BASE="${BASE%/}"

if [ -z "$BASE" ] || echo "$BASE" | grep -q localhost; then
  echo "Set BASE_URL to the deployed origin (APP_URL in .env.local is localhost)." >&2
  exit 1
fi

echo "Smoke-testing $BASE"
printf '  waiting for the deployment to answer'
for attempt in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/health" || true)"
  if [ "$code" = "200" ] || [ "$code" = "503" ]; then printf ' ok\n'; break; fi
  printf '.'
  sleep 3
  if [ "$attempt" = "20" ]; then printf '\n  it never answered — the checks below will say why.\n'; fi
done

failed=0
check() {
  local label="$1" url="$2" expected="$3" method="${4:-GET}"
  local actual
  actual="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X "$method" -H 'content-type: application/json' -d '{}' "$url")"
  if [ "$actual" = "$expected" ]; then
    printf '  \033[32mok\033[0m    %-44s %s\n' "$label" "$actual"
  else
    printf '  \033[31mFAIL\033[0m  %-44s %s (expected %s)\n' "$label" "$actual" "$expected"
    failed=1
  fi
}

check "health"                          "$BASE/api/health"              200
check "advisors refuse anonymous"       "$BASE/api/advisors"            401
check "new persona refuses anonymous"   "$BASE/api/advisors"            401 POST
check "convene refuses anonymous"       "$BASE/api/sessions"            401 POST
check "demo is behind sign-in in production" "$BASE/demo"                   307
check "root redirects to login"         "$BASE/"                        307

echo ""
if [ "$failed" -ne 0 ]; then
  echo "Smoke test failed. Roll back with: npx wrangler rollback" >&2
  exit 1
fi
echo "Smoke test passed."
