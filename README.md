# HT Land Acquisitions Dashboard

Honest Transportation's internal app for finding, researching, tracking and closing off-market land deals. It starts with semi-truck EV charging sites along I-10 in Riverside County.

**Status:** Phase 1 (foundation) is built. See [`docs/SETUP.md`](docs/SETUP.md) for the remaining dashboard steps, and [`docs/DEMO_CHECKLIST.md`](docs/DEMO_CHECKLIST.md) to click through it. [`docs/PLAN.md`](docs/PLAN.md) has the architecture and later phases.

**Stack:**
- Next.js 15 (App Router) + TypeScript + Tailwind 4, with Radix-based UI components
- Supabase: Postgres 17 + PostGIS, Auth, Storage, and RLS on every table
- Hosted on Firebase App Hosting; develop in Firebase Studio

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, triggers, RLS, RPCs (applied to the Supabase project) |
| `supabase/tests/` | SQL smoke tests: roles, RLS, status gates, audit, approvals/budget, imports |
| `lib/` | APN handling, strategy rules and EV score, import engine, URL filters, Supabase clients |
| `app/(app)/` | Home, Properties (+ detail), Pipeline, Tasks, Imports, Settings |
| `tests/unit`, `tests/e2e` | Vitest and Playwright |
| `scripts/local-stack/` | Local Supabase stand-in used by the E2E tests |
