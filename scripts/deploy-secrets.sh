#!/usr/bin/env bash
# Pushes the runtime secrets from .env.local into the Cloudflare Worker.
#
#   npm run deploy:secrets
#
# Only the SERVER-side values. NEXT_PUBLIC_* are inlined into the bundle at
# BUILD time and come from .env.local automatically on a manual deploy.
# SUPABASE_DB_URL is deliberately NOT uploaded: migrations run from a laptop
# and the Worker has no reason to hold a database password.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RUNTIME_SECRETS=(
  SUPABASE_SERVICE_ROLE_KEY
  APP_URL
  ANTHROPIC_API_KEY
  CLAUDE_API_KEY
  ADVISOR_MODEL
  SYNTHESIS_MODEL
)

[ -f .env.local ] || { echo "No .env.local." >&2; exit 1; }

whoami_out="$(npx wrangler whoami 2>&1)"; whoami_status=$?
if [ $whoami_status -ne 0 ] || echo "$whoami_out" | grep -qi 'not authenticated'; then
  echo "Cannot talk to Cloudflare:" >&2
  echo "$whoami_out" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Fix one of:" >&2
  echo "  npx wrangler login                # interactive, opens a browser" >&2
  echo "  export CLOUDFLARE_API_TOKEN=...   # for CI, or a non-interactive shell" >&2
  exit 1
fi

read_var() {
  local value
  value="$(grep -E "^$1=" .env.local | head -1 | cut -d= -f2-)" || true
  value="${value%\"}"; value="${value#\"}"
  printf '%s' "$value"
}

echo "Uploading runtime secrets to the Worker."
echo ""
warnings=0
for name in "${RUNTIME_SECRETS[@]}"; do
  value="$(read_var "$name")"
  if [ -z "$value" ]; then
    printf '  skip  %-28s (not set locally)\n' "$name"
    continue
  fi
  if err="$(printf '%s' "$value" | npx wrangler secret put "$name" 2>&1 >/dev/null)"; then
    printf '  put   %-28s (%d chars)\n' "$name" "${#value}"
    if [ "$name" = "APP_URL" ] && echo "$value" | grep -q 'localhost'; then
      echo "        ⚠ APP_URL is localhost. Sign-in links would be dead." >&2
      warnings=$((warnings + 1))
    fi
  else
    printf '  FAIL  %-28s\n' "$name"
    echo "$err" | sed 's/^/        /' >&2
    exit 1
  fi
done

echo ""
[ "$warnings" -gt 0 ] && echo "$warnings warning(s) above." >&2
echo "Done. Deploy with: npm run deploy"
