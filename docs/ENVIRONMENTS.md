# Environments

Owner's standing rule: **local and test data never touch production.**

| | local | preview | production |
|---|---|---|---|
| Next.js | `next dev` on a dev machine | Vercel preview deployment (every push) | Vercel production (`main`) |
| Database | Supabase CLI (Docker) on localhost, or mocks in tests | Supabase **staging** project | Supabase **production** project |
| Auth | local Supabase Auth | staging Auth, test accounts | real fans |
| Data | `supabase/seed.sql` | seed + test data | real data only |
| Who can see | the developer | the owner (preview URL) | everyone |

## Env vars (validated in `apps/web/src/lib/env.ts`)
| Name | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | differs per environment |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | safe to expose; RLS protects data |
| `SUPABASE_SECRET_KEY` | server only | bypasses RLS: ingest and admin jobs only |
| `DATABASE_URL` | server only | pooled connection (transaction mode) for Drizzle |
| `INGEST_SECRET` | server only | guards `/api/ingest` and revalidation webhooks |
| `NEXT_PUBLIC_APP_ENV` | client + server | `local` / `preview` / `production`; shows a banner outside production |

Set them in Vercel per environment (Production / Preview / Development). Production values exist **only** in Vercel's Production scope and in the GitHub `production` environment. `.env.local` is git-ignored; `.env.example` lists names only.

## Guards
- `lib/env.ts` refuses to start if a production database URL is used with `NEXT_PUBLIC_APP_ENV !== 'production'`.
- Tests and scripts read only `.env.test` / local URLs.
- A visible "סביבת בדיקות" banner shows in every non-production environment.

## Legacy app (until cutover)
`index.html` picks its backend from the hostname: `yair003-sys.github.io` → Firebase production; `localhost?emu=1` → `demo-hayatzia` emulators; anything else → no backend (demo data).
