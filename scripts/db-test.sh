#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the assertions in
# supabase/tests against it. Nothing here touches the real project.
#
#   npm run db:test
#
# Uses $DATABASE_URL if it is set (a local Postgres, or `supabase start`).
# Otherwise it stands up a disposable cluster in a temp directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usable_bin() {
  local dir="$1"
  [ -x "$dir/psql" ] || return 1
  "$dir/psql" --version >/dev/null 2>&1 || return 1
  if [ -z "${DATABASE_URL:-}" ]; then
    [ -x "$dir/postgres" ] && [ -x "$dir/initdb" ] || return 1
    "$dir/postgres" --version >/dev/null 2>&1 || return 1
  fi
  return 0
}

find_psql() {
  local candidate
  if command -v psql >/dev/null 2>&1; then
    candidate="$(dirname "$(command -v psql)")"
    usable_bin "$candidate" && echo "$candidate" && return
  fi
  for candidate in /Applications/Postgres.app/Contents/Versions/*/bin \
                   /opt/homebrew/opt/postgresql@*/bin \
                   /opt/homebrew/opt/postgresql/bin \
                   /usr/local/opt/postgresql@*/bin; do
    usable_bin "$candidate" && echo "$candidate" && return
  done
  echo "Could not find a working PostgreSQL installation. Install one (brew install postgresql@17), or set DATABASE_URL." >&2
  exit 1
}

PGBIN="$(find_psql)"

run_suite() {
  for migration in supabase/migrations/*.sql; do
    echo "  applying $(basename "$migration")"
    "$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f "$migration" >/dev/null
  done
  for suite in supabase/tests/*.test.sql; do
    echo "  running $(basename "$suite")"
    "$PGBIN/psql" -v ON_ERROR_STOP=1 -q -f "$suite" 2>&1 | sed 's/^psql:[^ ]* //'
  done
}

if [ -n "${DATABASE_URL:-}" ]; then
  export PGDATABASE="$DATABASE_URL"
  "$PGBIN/psql" -q -c "create role anon nologin;" >/dev/null 2>&1 || true
  "$PGBIN/psql" -q -c "create role authenticated nologin;" >/dev/null 2>&1 || true
  run_suite
  exit 0
fi

PGDATA_DIR="$(mktemp -d)"
PORT=${PGPORT_TEST:-55434}
cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$PGDATA_DIR"
}
trap cleanup EXIT

echo "Starting a throwaway PostgreSQL cluster on port $PORT"
"$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" \
  -o "-p $PORT -h 127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE=quorum_test
"$PGBIN/psql" -q -d postgres -c "create database quorum_test;" >/dev/null
"$PGBIN/psql" -q -c "create role anon nologin; create role authenticated nologin;" >/dev/null

run_suite
