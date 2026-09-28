# Setup — what's done and what needs you

## Already done

- **Supabase project:** "Honest123111's Project" (`sciivzgingzpxxqihrkh`, us-west-2).
  - All migrations in `supabase/migrations/` are applied: 37 tables, RLS on every one, PostGIS, and the Storage buckets `property-files` and `imports`.
  - The existing trucking tables (`drivers`, `shipments`, …) were left untouched.
- **Admin bootstrap:** `kevin@honesttransportation.com` becomes an active **Admin** on first sign-in (set in `app_settings.bootstrap_admin_emails`). Other @honesttransportation.com accounts start as active Viewers. Anyone else waits for activation in Settings → Users.
- **Seeded data:**
  - 18 tasks: the 16 from the task tracker, plus 2 "find the APN" tasks for the Victorville and Needles priority sites, which have no APN yet.
  - 10 properties: the 7 I-10 tracker sites plus Menifee, Barstow and Daggett. All are tagged **EV Candidate** with strategy *EV Candidate* (locked), plus Big-Rig scores where the brief gave them.
  - Distances are the tracker's estimates, marked "estimate" until Phase 2 loads real parcel polygons.

## Needs you in the Supabase dashboard

1. **Authentication → URL Configuration**
   - *Site URL:* your App Hosting URL, once the backend exists.
   - *Redirect URLs:* add `https://<your-app-hosting-domain>/**`, `http://localhost:3000/**`, and `https://*.cloudworkstations.dev/**` (Firebase Studio previews).
2. **Authentication → Emails → Magic Link** template, so links work across devices and the 6-digit code works on phones. Replace the body with:
   ```html
   <h2>Sign in to HT Land</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   <p>Or enter this code: <b>{{ .Token }}</b></p>
   ```
3. **Custom SMTP (recommended).** Supabase's built-in mailer sends only a few emails per hour. Set up Resend or your SMTP under Authentication → Emails → SMTP before the team signs in.
4. **Google sign-in** (when your OAuth client is ready):
   - Authentication → Sign In / Providers → Google: paste the Client ID and Secret.
   - In Google Cloud Console, add this authorized redirect URI: `https://sciivzgingzpxxqihrkh.supabase.co/auth/v1/callback`.
   - The app already restricts the Google chooser to honesttransportation.com.
5. **Unrelated but flagged:** the trucking tables in this project (`drivers`, `shipments`, `trucking_companies`, …) can currently be read by anyone holding the public anon key, per the Supabase security advisor. If they're unused, revoke `select` from `anon`.

## Firebase Studio + App Hosting

- **Firebase Studio:** *Import repo* → `Honest123111/Honest`.
  - `.idx/dev.nix` installs Node 22, runs `npm ci`, and starts the dev preview.
  - Copy `.env.example` to `.env.local` and fill in the two Supabase values. They're also in `apphosting.yaml`.
- **App Hosting:** Firebase console → App Hosting → *Create backend* → connect the GitHub repo and branch.
  - `apphosting.yaml` supplies the public env vars.
  - **App Hosting requires the Blaze (pay-as-you-go) plan.** A billing account must be attached, even though a small team's usage usually stays inside the free allowances.

## Local development & tests

```bash
npm ci
npm run dev              # uses .env.local
npm test                 # unit tests (vitest): APN, strategy rules, EV score, import dedupe/conflicts, filters
npm run test:db          # migrations + RLS/trigger smoke tests on a throwaway Postgres 16 + PostGIS
npm run stack:local      # local Supabase stand-in (Postgres + PostgREST + auth/storage gateway) for E2E
npm run test:e2e         # Playwright, iPhone viewport: Phase 1 path, imports, layout
```

For E2E against the local stack, start the app with the env printed by `stack:local`. Then run:
`E2E_EMAIL=acq@honesttransportation.com E2E_MENTION_EMAIL=analyst@honesttransportation.com E2E_PASSWORD=… npm run test:e2e`
