# Environments

Owner's standing rule: **local and test data never touch production.**

| | local | preview | production |
|---|---|---|---|
| Next.js | `next dev` on a dev machine | Vercel preview deployment (every push) | Vercel production (`main`) |
| Database | Supabase CLI (Docker) on localhost, or mocks in tests | Supabase **staging** `yblzcgetkfbdwsfogkqp` (Frankfurt) | Supabase **production** `loaqhisfhafjbrmtygrp` (Frankfurt) |
| Auth | local Supabase Auth | staging Auth, test accounts | real fans |
| Data | `supabase/seed.sql` | seed + test data | real data only |
| Who can see | the developer | the owner (preview URL) | everyone |

## Env vars (validated in `apps/web/src/lib/env.ts`)
| Name | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | differs per environment |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | safe to expose; RLS protects data |
| `SUPABASE_SECRET_KEY` | server only | bypasses RLS: ingest and admin jobs only |
| `INGEST_SECRET` | server only | guards `/api/ingest` and revalidation webhooks |
| `NEXT_PUBLIC_APP_ENV` | client + server | `local` / `preview` / `production`; shows a banner outside production |

Set them in Vercel per environment (Production / Preview / Development). Production values exist **only** in Vercel's Production scope and in the GitHub `production` environment. `.env.local` is git-ignored; `.env.example` lists names only.

## Vercel project
- Team "hayaziha" (Hobby), project `hayatzia`, root directory `apps/web`, Git: `yair003-sys/hayatzia` (`main` → production, any other branch → preview).
- Production URL: https://hayatzia-flame.vercel.app. Previews: `hayatzia-*-hayaziha.vercel.app`.
- Function region: `fra1` (Frankfurt, next to the database), pinned in `apps/web/vercel.json`.
- `vercel.json` `ignoreCommand` skips builds when a commit does not touch `apps/web` (the legacy hourly league-data commits would otherwise rebuild every hour). Changing only Vercel env vars needs a manual "Redeploy" in the dashboard.
- Env vars set: Production → `NEXT_PUBLIC_APP_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL=https://loaqhisfhafjbrmtygrp.supabase.co`; Preview + Development → `preview`, `https://yblzcgetkfbdwsfogkqp.supabase.co`. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set per environment (pasted by the owner; Claude never types keys).

## Supabase Auth URLs
- Production: Site URL `https://hayatzia-flame.vercel.app`; redirect allow-list `https://hayatzia-flame.vercel.app/auth/callback`.
- Staging: redirect allow-list `https://hayatzia-*-hayaziha.vercel.app/**` (preview deployments only).
- Google provider: on in both projects. One OAuth web client `hayatzia-supabase` in Google Cloud project `hayatzia-2b0ff` (separate from Firebase's auto-created client), redirect URIs = both `https://<ref>.supabase.co/auth/v1/callback`. Client ID + secret were pasted by the owner. Verified 2026-10-11: production login → Google → `/onboarding`.

## GitHub environments (league ingest)
- `staging` and `Production` (shared with Vercel's deployment records; names are case-insensitive). Each has variable `SUPABASE_URL` and secret `SUPABASE_SECRET_KEY` (that project's `sb_secret_…`, pasted by the owner).
- `.github/workflows/web-ingest.yml` runs per environment; the legacy `update.yml` calls it whenever `data/` changed. Manual run: dispatch with `inputs[target]=staging|production|both`.
- The script strips whitespace and invisible direction marks from the key (pasting on a Hebrew keyboard adds them) and reports row counts as a `::notice` annotation.

## Supabase projects
- Organization: "yair003-sys's Orghayatzia" (free plan), owner signs in with GitHub.
- Both projects: region eu-central-1 (closest to Israel), Data API on, **new tables not auto-exposed** (grants are explicit in migrations), **automatic RLS on new tables**.
- Migrations live in `apps/web/supabase/migrations/` and are applied **staging first, verified, then production** (currently via the dashboard SQL editor; a CI migration job comes later).
- Reference data (teams, players) is applied to both; test data only ever to staging.

## Guards
- `lib/env.ts` refuses to start if the production project URL is used with `NEXT_PUBLIC_APP_ENV !== 'production'` (unit-tested in `env.test.ts`).
- Tests and scripts read only `.env.test` / local URLs.
- A visible "סביבת בדיקות" banner shows in every non-production environment.

## Legacy app (until cutover)
`index.html` picks its backend from the hostname: `yair003-sys.github.io` → Firebase production; `localhost?emu=1` → `demo-hayatzia` emulators; anything else → no backend (demo data).
