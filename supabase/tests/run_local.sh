#!/usr/bin/env bash
# Spin up a throwaway Postgres 16 + PostGIS, apply all migrations, run the smoke test.
# Needs: postgresql-16 + postgresql-16-postgis-3 (apt). Run as root (uses the postgres user).
set -euo pipefail
cd "$(dirname "$0")/../.."
P=${PGTEST_DIR:-/var/tmp/htpg}
BIN=/usr/lib/postgresql/16/bin
if [ ! -f "$P/data/PG_VERSION" ]; then
  mkdir -p "$P" && chown postgres "$P"
  su postgres -c "$BIN/initdb -D $P/data -A trust >/dev/null"
fi
su postgres -c "$BIN/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/pg.log status >/dev/null || $BIN/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/pg.log -w start >/dev/null"
Q="psql -h $P -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"
$Q -c "drop database if exists ht_test" -c "create database ht_test"
$Q -d ht_test -f supabase/tests/supabase_stubs.sql
$Q -d ht_test -c "alter database ht_test set search_path = public, extensions"
for f in supabase/migrations/*.sql; do $Q -d ht_test -f "$f"; done
$Q -d ht_test -f supabase/tests/smoke.sql | grep -E 'PASSED'
