#!/usr/bin/env bash
# Local Supabase stand-in for end-to-end tests: Postgres 16 + PostGIS with the
# real migrations, PostgREST, and a tiny auth/storage gateway.
#   scripts/local-stack/up.sh            # prints the env vars to run the app with
# Needs postgresql-16(+postgis) and a postgrest binary (POSTGREST_BIN).
set -euo pipefail
cd "$(dirname "$0")/../.."
P=${PGTEST_DIR:-/var/tmp/htpg}
BIN=/usr/lib/postgresql/16/bin
DB=ht_e2e
PGRST=${POSTGREST_BIN:-postgrest}
export JWT_SECRET=${JWT_SECRET:-local-e2e-secret-at-least-32-characters-long}
E2E_PASSWORD=${E2E_PASSWORD:-local-e2e-password}
LOGS=${LOGS:-/tmp/ht-local-stack}; mkdir -p "$LOGS"

if [ ! -f "$P/data/PG_VERSION" ]; then mkdir -p "$P" && chown postgres "$P" && su postgres -c "$BIN/initdb -D $P/data -A trust >/dev/null"; fi
su postgres -c "$BIN/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/pg.log status >/dev/null || $BIN/pg_ctl -D $P/data -o '-p 5499 -k $P' -l $P/pg.log -w start >/dev/null"
Q="psql -h $P -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"
for pidf in "$LOGS/postgrest.pid" "$LOGS/gateway.pid"; do [ -f "$pidf" ] && kill "$(cat "$pidf")" 2>/dev/null || true; done
$Q -c "drop database if exists $DB with (force)" -c "create database $DB"
$Q -d $DB -f supabase/tests/supabase_stubs.sql
$Q -d $DB -c "alter database $DB set search_path = public, extensions"
for f in supabase/migrations/*.sql; do $Q -d $DB -f "$f"; done

# test users (admin, acquisitions, analyst) + a few sample parcels
$Q -d $DB <<SQL
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@honesttransportation.com',   extensions.crypt('$E2E_PASSWORD', extensions.gen_salt('bf')), '{"full_name":"Local Admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'acq@honesttransportation.com',     extensions.crypt('$E2E_PASSWORD', extensions.gen_salt('bf')), '{"full_name":"Local Acquisitions"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'analyst@honesttransportation.com', extensions.crypt('$E2E_PASSWORD', extensions.gen_salt('bf')), '{"full_name":"E2E Analyst"}');
update public.profiles set role = 'admin' where email like 'admin@%';
update public.profiles set role = 'acquisitions' where email like 'acq@%';
update public.profiles set role = 'analyst' where email like 'analyst@%';
select set_config('app.change_source', 'seed', true);
insert into public.properties (county, apn, situs_address, situs_city, acres, zoning, land_value, structure_value, distance_to_i10_mi, location_method, strategy, tags, lead_status)
values ('riverside','111222333','100 Sample Rd','Blythe',6.2,'M1',42000,0,0.8,'plss_estimate','large_vacant','{EV Candidate}','researching'),
       ('riverside','111222334','200 Sample Rd','Indio',1.1,'C-1',8000,55000,3.4,'plss_estimate','improved','{}','new'),
       ('san_bernardino','042403140',null,'Barstow',null,null,null,null,null,null,'ev_candidate','{EV Candidate}','new');
insert into public.tax_status (property_id, snapshot_date, source, years_in_default, redemption_amount, owed_to_land_ratio, auction_date)
select id, '2025-10-01', 'sample', 6.1, 9100, 0.22, current_date + 30 from public.properties where apn = '111222333';
insert into public.tasks (title, category, priority) values ('Sample general task', 'gis_api', 3);
SQL

cat > "$LOGS/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@/$DB?host=$P&port=5499"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$JWT_SECRET"
server-port = 3001
CONF
nohup "$PGRST" "$LOGS/postgrest.conf" > "$LOGS/postgrest.log" 2>&1 &
echo $! > "$LOGS/postgrest.pid"
DATABASE_URL="postgres://postgres@/$DB?host=$P&port=5499" nohup node scripts/local-stack/gateway.mjs > "$LOGS/gateway.log" 2>&1 &
echo $! > "$LOGS/gateway.pid"
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3001/ && curl -s -o /dev/null http://127.0.0.1:54321/ && break; sleep 0.5; done

ANON=$(JWT_SECRET=$JWT_SECRET node --input-type=module -e "
import crypto from 'node:crypto';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'anon', iss: 'local', exp: 4102444800 });
console.log(h + '.' + p + '.' + crypto.createHmac('sha256', process.env.JWT_SECRET).update(h + '.' + p).digest('base64url'));")
echo "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321"
echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON"
echo "E2E_PASSWORD=$E2E_PASSWORD"
