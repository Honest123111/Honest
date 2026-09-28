# HT Land Acquisitions Dashboard — Architecture & Phase 1 Plan

Status: **Phase 1 built** (2026-09-28). Decisions from review:
- Supabase: use the existing *Honest123111's Project*.
- Hosting: Firebase Studio + App Hosting instead of Vercel.
- kevin@ is Admin, and company-domain users auto-join as Viewers.
- Acquisitions may approve teammates' email reveals; phone reveals and skip trace stay Admin-only.
- EV Candidate is both a tag and a locked strategy.
- Viewers can see contacts.

The original proposal follows.

What's in the repo for review:

| File | What it is |
|---|---|
| `supabase/migrations/20260927000100_schema.sql` | Extensions, enums, all tables (Phases 1–5), indexes, GIS reference tables |
| `supabase/migrations/20260927000200_logic.sql` | Role helpers, audit trigger, status gates, PostGIS distance, @mentions, enrichment approval + budget stop, grid view, global search |
| `supabase/migrations/20260927000300_rls.sql` | RLS on every table + Storage bucket policies |
| `supabase/migrations/20260927000400_default_data.sql` | Default lead statuses, strategies + rules, DD template, provider settings (paid = off, $0 cap) |
| `supabase/tests/smoke.sql` | Runnable checks for RLS, roles, gates, dedupe, audit, approvals, budget cap, distance calc |

All four migrations were applied to a local Postgres 16 + PostGIS 3.4 with Supabase `auth`/`storage` stubs. Result: 37 tables, RLS enabled on 37/37, 138 policies, smoke test passes.

---

## 1. Stack: confirmed, with four adjustments

| Area | Choice | Note |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui | As specified. TanStack Table for the grid, dnd-kit for Kanban and column drag. |
| DB/Auth/Storage | Supabase (Postgres 17 + PostGIS, Auth, Storage, Vault) | As specified. **API keys go in Supabase Vault** (encrypted at rest). Tables store only the vault id and the last 4 characters. |
| Server logic | **Change:** Next.js Route Handlers / Server Actions on Vercel for integrations and webhooks (n8n, Twilio, SOS, Apollo). Supabase Edge Functions only for scheduled jobs (budget alerts, task-due emails) via `pg_cron`. | One TypeScript codebase, one test runner, and secrets stay server-side either way (`server-only` imports). Tell me if you'd rather keep everything in Edge Functions. |
| Maps | MapLibre GL + **Esri World Imagery** by default (no key). Mapbox is a drop-in behind a `MapProvider` config. | Avoids a Mapbox bill in Phase 2. Street View link-out per parcel. |
| Imports | SheetJS parses XLSX/CSV in the browser for the preview. Commit runs server-side in 500-row batches through a Postgres RPC. | Native parsing, no AI. |
| Charts | Recharts | As specified. |
| Tests | Vitest (strategy rules, APN normalizing, import dedupe/merge), SQL smoke/pgTAP (RLS and permissions), Playwright (the Phase 1 "done when" path on a mobile viewport) | |
| Hosting | Vercel | **Note:** Vercel Hobby is non-commercial only. A business app needs **Vercel Pro ($20/user/mo)**. I need your OK (see Q2). |

## 2. Architecture

```
 Browser (Next.js, mobile-first)
   │  anon key + user JWT → PostgREST / RPC (RLS enforces roles)
   ▼
 Supabase Postgres + PostGIS ──── Storage (property-files, imports buckets; private)
   ▲        ▲   pg_cron → Edge Fn (alerts, email digests)
   │        │
 Next.js server (Vercel)  ── service role, Vault secrets ──►  Riverside/SB GIS, SCAG, Caltrans, CA SOS (free)
   │  /api/webhooks/n8n (HMAC)          ◄── n8n Cloud (honest122)       Apollo / skip-trace / Regrid / Lob (paid, gated)
   │  /api/webhooks/twilio (signature)  ◄── Twilio                      Resend (email)
```

Key rules the database enforces (so the UI can't bypass them):

- **Roles.** Every policy goes through `private.user_role()`, which returns null for inactive profiles, so off-domain sign-ups see nothing until an Admin activates them. Analysts are held to a **column allowlist** by a trigger: research fields only, with no status, price, assignee or consent changes.
- **Audit.** A trigger on every business table writes the changed fields (old/new), the user and `change_source` (user / import / n8n / system). The property History tab reads from `audit_log.property_id`.
- **Import safety.**
  - APN is unique per `(county, apn)` and stored as digits only, so `836-121-003` and `836121003` count as the same parcel.
  - Every field change records who and what set it in `properties.field_sources`. The import preview flags an incoming value as a **conflict** when the current value was set by a user, and it overwrites only with confirmation.
- **Pipeline gates.** *Offer made* requires an offer row. *Under contract* requires a `contract` document. *Dead* requires a reason. Every status change writes a `status_change` activity.
- **Paid calls.**
  - Requests are created only through the `request_enrichment()` RPC, which computes the cost estimate server-side, and approved through the `decide_enrichment()` RPC.
  - Phone reveals and skip trace need Admin approval. Other paid calls can be approved by Admin, or by Acquisitions on someone else's request.
  - Approval is a **hard stop** if ledger spend this month plus already-approved estimates would pass the provider cap or the overall cap.
  - Only the service role writes the ledger.
- **Distance.** When a parcel polygon arrives, the trigger sets the centroid, measures the edge distance to the I-10 line (geography, in miles), finds the nearest interchange and derives `corridor_zone`. PLSS estimates stay until real polygons replace them. `recompute_property_geo()` re-runs everything after the centerline is loaded.
- **Strategy and scores.** These are evaluated by one TypeScript module (`lib/rules`), driven by the `strategy_rules` table and `app_settings.scoring_weights`, and unit-tested. Changing a rule in Settings triggers a batch recalculation. `strategy_locked` protects manual overrides.

### Deviations from the brief (please confirm)

1. **APN is not "unique, 9 digits".** San Bernardino APNs are 4-3-2 (+4) digits (`0424-031-40`) and LA APNs are 4-3-3 (10 digits), and your off-market list includes both. So the column is 9–14 digits, unique per county, displayed in each county's format.
2. `source_list` uses `tax_default` plus `source_year` instead of `tax_default_2025`, so 2026 doesn't need a schema change.
3. Lead statuses, strategies, strategy rules, tags, the DD template and mail templates are **lookup tables** (editable in Settings), not enums.
4. Tables added beyond §4: `profiles`, `app_settings`, `provider_settings`, `strategy_rules`, `tags`, `dd_templates(_items)`, `mail_templates`, `notifications`, `do_not_contact`, `tracking_numbers`, `import_rows` (staged preview), `sales_comps`, `reference.truck_aadt_points`. The Big-Rig components (3/3/2/2 plus notes) live on `site_metrics`, and a trigger keeps `properties.big_rig_access_score` equal to their sum.
5. Free providers (GIS, SOS, n8n) skip the approval queue but are still logged as enrichment requests.

## 3. Folder structure

```
/
├─ app/
│  ├─ (auth)/login/                      magic link + Google
│  ├─ (app)/layout.tsx                   sidebar / bottom nav, top search, bell, quick-add
│  ├─ (app)/page.tsx                     Home dashboard
│  ├─ (app)/properties/                  table + saved views
│  ├─ (app)/properties/[id]/             detail; tabs via ?tab=
│  ├─ (app)/map/ pipeline/ tasks/ owners/ outreach/ imports/ enrichment/ reports/ settings/
│  └─ api/webhooks/{n8n,twilio}/route.ts
├─ components/  ui/ (shadcn)  properties/  map/  pipeline/  tasks/  imports/  activity/  charts/
├─ lib/
│  ├─ supabase/ {client,server,admin}.ts  (admin = service role, server-only)
│  ├─ rules/ strategy.ts  scores.ts        (pure, unit-tested)
│  ├─ apn.ts                               normalize/format per county
│  ├─ imports/ formats/*.ts  mapper.ts  diff.ts   (known column maps + dedupe/conflict diff)
│  ├─ integrations/ gis/ sos/ apollo/ skiptrace/ n8n/ twilio/ mail/   (one adapter each, Phase 2+)
│  └─ auth/roles.ts
├─ supabase/ migrations/  functions/  tests/  seed.sql
├─ scripts/ seed.ts                        loads /seed files + priority sites, promotes ADMIN_EMAIL
├─ seed/                                   your xlsx files (git-ignored if you prefer; see Q4)
├─ tests/ unit/  e2e/
├─ docs/ PLAN.md  USER_GUIDE.md (Phase 5)
└─ .env.example
```

## 4. Phase 1 task list (each item is a small commit)

1. Scaffold Next.js, Tailwind, shadcn, ESLint/Prettier, Vitest, Playwright, `.env.example`, CI (lint + typecheck + unit + SQL smoke).
2. Supabase: link the project, apply migrations, generate TS types, and enable Google + magic-link auth restricted to the company domain.
3. Auth pages, middleware session refresh, role-aware nav, and mobile bottom nav.
4. `lib/apn`, `lib/rules` (strategy classifier + EV score) with unit tests.
5. Import wizard:
   - upload to Storage, pick sheet and header row
   - auto-map columns for the 3 seed formats (the I-10 leads workbook's 7 tabs, the TTC PTS inventory with its header on row 4, and the off-market list with book+page+parcel → APN and co-owner % parsing)
   - preview (matched / new / conflict) → commit, with import history and an error report
   - dedupe and conflict tests
6. Seed script:
   - run the three files through the same importer
   - load the 16 tasks from the tracker sheet
   - apply the "EV Candidate" tag and Big-Rig scores to the 10 priority sites
   - load Sheet2 into `sales_comps`
7. Properties table:
   - server pagination, sort and filter on `property_grid`
   - column chooser and drag-reorder
   - saved views (personal/shared) with the 3 example views
   - inline edit of status, assignee, priority and tags
   - bulk assign / status / tag / CSV export
8. Property detail: header, quick actions, and the Overview, Owner & Contacts, Activity (threaded notes, @mentions, markdown, attachments), Tasks, Documents (upload + PDF/image preview) and History tabs.
9. Pipeline Kanban (drag triggers a status change and the gate prompts: offer form, contract upload, dead reason) and a Tasks board/list.
10. Home dashboard KPIs, funnel and by-strategy charts, My tasks, Recent activity, and alerts (auction ≤ 60 days, stale ≥ 14 days).
11. Notifications bell (in-app). Email for mentions follows in Phase 5 unless you want Resend now.
12. Demo checklist + Playwright test of the "done when" path on an iPhone viewport.

**Phase 1 done when** (from the brief): you log in on your phone, open any APN, change its status, @mention a teammate in a note, add a task, upload a PDF, and see all of it in the timeline and the audit log.

## 5. Questions before I scaffold

1. **Supabase project.** Your account has *Honest123111- N8N* (active, us-east-1) plus two paused projects (*Freight cargo theft database*, *Honest123111's Project*). I recommend a **new dedicated project** ("HT Land Acquisitions", us-west-1). It keeps land-deal PII and RLS separate from the n8n data. A new project may move the org onto a paid plan (the free tier allows 2 active projects; Pro is $25/mo). Is it OK to create it, or should I reuse one?
2. **Vercel Pro ($20/mo)** for commercial hosting. OK?
3. **Team and roles.** Who gets Acquisitions / Analyst / Viewer at launch? Should sign-in be restricted to @honesttransportation.com (auto-activated as Viewer), with outside people invite-only?
4. **Seed files.** Please upload to `/seed`: `Riverside_TaxDefault_Leads.xlsx`, `2025 PTS INVENTORY - TAG ORDER.xlsx`, `list 2 excel 3.xlsx`. They contain owner PII. Should they stay out of git (loaded from local disk / Storage only)? I recommend yes. For the two Google Sheets, I can read them through your connected Google Drive if you OK that.
5. **Phase 1 keys (all free):**
   - Supabase URL, anon and service-role keys. I can pull these once the project exists.
   - A **Google OAuth client ID/secret** (Google Cloud Console → Credentials) for Google sign-in.
   - Optional: a Resend API key. Magic-link emails work on Supabase's built-in mailer, but it's rate-limited to a few per hour, so custom SMTP or Resend is advisable before the team logs in.
6. **Approvals.** I read "email reveal allowed with Acquisitions approval" as *an Acquisitions user can approve a teammate's email-reveal request, but not their own*. Phone reveals and skip trace stay Admin-only. Correct?
7. **"EV Candidate".** I seeded it as both a tag and a manual strategy (`strategy_locked`). Should it be a tag only, so the 5 rule-based strategies stay exclusive?
8. **Viewer PII.** Should Viewers see owner phone numbers and emails, or should contacts be hidden from Viewers?
9. **Server logic location.** Is it OK to use Next.js route handlers for integrations instead of Edge Functions (see §1)?
