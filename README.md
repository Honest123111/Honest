# HT Land Acquisitions Dashboard

Internal web app for Honest Transportation's Land Acquisitions team: find, research, track and close off-market land deals (I-10 semi-truck EV charging sites first).

**Status:** architecture and database schema proposed for review — see [`docs/PLAN.md`](docs/PLAN.md).

- Schema + RLS: `supabase/migrations/`
- Smoke tests: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql` (runs in a transaction and rolls back)
