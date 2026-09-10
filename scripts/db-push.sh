#!/usr/bin/env bash
# Applies supabase/migrations/* to the remote project over a direct database
# connection, using SUPABASE_DB_URL from .env.local.
#
#   npm run db:push -- --dry-run    show what would be applied
#   npm run db:push                 apply
#
# Deliberately does NOT use `supabase login` + `supabase link`: that needs a
# personal access token scoped to the whole ACCOUNT. The database password is
# scoped to this one database, so it is the smaller thing to hand over.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "No .env.local. Copy .env.example and fill it in first." >&2
  exit 1
fi

DB_URL="$(grep -E '^SUPABASE_DB_URL=' .env.local | head -1 | cut -d= -f2-)"
DB_URL="${DB_URL%\"}"; DB_URL="${DB_URL#\"}"
DB_URL="${DB_URL%\'}"; DB_URL="${DB_URL#\'}"

if [ -z "$DB_URL" ] || [[ "$DB_URL" == *"PASSWORD"* ]]; then
  cat >&2 <<'MSG'
SUPABASE_DB_URL is missing or still contains the placeholder password.

Set it in .env.local to the connection string from
Supabase -> Project Settings -> Database -> Connection string (URI):

  SUPABASE_DB_URL=postgresql://postgres:THEPASSWORD@db.<ref>.supabase.co:5432/postgres

If the password contains @ : / ? # or %, percent-encode it (@ becomes %40).
MSG
  exit 1
fi

echo "Applying migrations to ${DB_URL%%:*}://…@${DB_URL##*@}"
exec npx supabase db push --db-url "$DB_URL" "$@"
