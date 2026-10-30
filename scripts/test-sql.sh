#!/usr/bin/env bash
# Runs supabase/tests/*.sql against a throwaway PostgreSQL database with Supabase-like roles.
# Local: needs PostgreSQL 16 binaries (initdb, pg_ctl). CI: set PGHOST/PGUSER/PGPASSWORD for a service container.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${PGHOST:-}" ]]; then
  BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  DATA="$(mktemp -d)"
  trap '"$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
  RUN=""
  if [[ "$(id -u)" == "0" ]]; then RUN="runuser -u postgres --"; chown postgres "$DATA"; fi
  $RUN "$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
  $RUN "$BIN/pg_ctl" -D "$DATA" -o "-k $DATA -p 54329 -c listen_addresses=''" -w start >/dev/null
  export PGHOST="$DATA" PGPORT=54329 PGUSER=postgres
fi

DB="vlo_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
grant usage on schema public, extensions to anon, authenticated;
SQL
for migration in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$migration"
done
for test in supabase/tests/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$test"
done
psql -q -d postgres -c "drop database $DB" >/dev/null
