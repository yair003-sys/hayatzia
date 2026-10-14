# Architecture (new app, `apps/web`)

The design rationale lives in `superpowers/specs/2026-10-11-nextjs-platform-design.md`. This file is the living reference: update it whenever structure changes.

## Layers
```
Browser ── Client Components (interactive leaves, realtime, E2EE crypto)
   │         └ react-query cache · supabase-js realtime · nuqs URL state
   ▼
Vercel CDN ── static shells (Partial Prerendering) + cached segments ('use cache')
   │
Next.js server ── Server Components (reads) · Server Actions (writes) · Route Handlers (webhooks/cron)
   │                └ supabase-js typed by generated DB types · @supabase/ssr (session from cookies)
   ▼
Supabase ── Postgres (RLS on every table, triggers, pg_cron) · Auth · Realtime · Storage (CDN)
   ▲
GitHub Actions ── API-Football ingest every 10 min → Postgres → revalidateTag webhook
```

## Folder structure
```
apps/web/
  src/
    app/                    Routes only. Thin: compose feature components, no business logic.
      (public)/             Landing, login, onboarding. No tab bar.
      (app)/                Signed-in shell with the tab bar (layout.tsx).
      api/                  Route handlers: webhooks, cron, ingest. Verify a secret on each.
      layout.tsx            <html lang="he" dir="rtl">, fonts, providers.
      globals.css           Tailwind v4 entry + design tokens.
    features/<name>/
      components/           Feature UI. Server by default; `'use client'` only where needed.
      server/queries.ts     Reads. Shared data uses 'use cache' + cacheLife + cacheTag.
      server/actions.ts     Writes via next-safe-action, Zod-validated, auth-checked.
      hooks/                Client hooks (react-query, realtime subscriptions).
      schema.ts             Zod schemas + inferred types shared by UI and server.
    lib/
      supabase/             client.ts (browser), server.ts (RSC/actions), public.ts (cookie-less, for 'use cache'), proxy.ts (session refresh), database.types.ts (generated, never edit).
      env.ts                @t3-oss/env-nextjs: the only place that reads process.env.
      e2e/                  WebCrypto end-to-end encryption (ported from the legacy app).
      utils.ts              cn() and small pure helpers.
    components/ui/          shadcn/ui primitives (owned code, RTL-adjusted).
    proxy.ts                Session refresh only (Next 16 "proxy", formerly middleware).
  supabase/                 migrations/, seed.sql, config.toml (Supabase CLI).
  tests/                    e2e (Playwright). Unit tests sit next to the code as *.test.ts(x).
```

## Rules of the road
1. **Server Components by default.** Add `'use client'` at the lowest possible leaf.
2. **Reads** happen in Server Components through `features/*/server/queries.ts`. Shared, non-personal data is cached with `'use cache'`, `cacheLife(...)` and `cacheTag(...)`. Personal or runtime data (`cookies()`, `headers()`, `searchParams`) is read inside `<Suspense>`.
3. **Writes** go through Server Actions (`next-safe-action`) only. After a write, call `updateTag`/`revalidateTag` for affected shared data. Client caches are patched optimistically by react-query.
4. **Authorization** lives in the database (RLS) and is re-checked in actions with `getClaims()`. `proxy.ts` never decides access.
5. **Realtime** (chat, rooms, counters) subscribes from Client Components through `features/*/hooks`. Channels are scoped (per team, per match, per thread).
6. **URL is state.** Tabs, filters and open items live in the path or in search params (nuqs), so refresh and share links always work.
7. **No `process.env` outside `lib/env.ts`.** The service-role key is server-only and never used in code reachable from the browser.
8. **Media** is compressed in the browser and uploaded directly to Supabase Storage. Rows store the storage path, never bytes.

## Route map (target)
| Route | Screen (legacy name) |
|---|---|
| `/` | Welcome / landing |
| `/login`, `/onboarding/team`, `/onboarding/nick` | Sign-in and the one-time team lock |
| `/stand` | היציע שלי (my club home: pitch, ratings, photos, match day) |
| `/matches`, `/matches/[id]` | משחקים + match room |
| `/square`, `/square/[clipId]` | הכיכר |
| `/team/chat`, `/team/trips`, `/team/events`, `/team/market` | Team space tabs |
| `/inbox`, `/inbox/[threadId]` | Private messages (E2EE) |
| `/me` | הכרטיס שלי |
| `/activity` | התראות (activity bell: likes on my posts, trip requests / acceptances; the bell sits on every in-app screen) |
| `/fans/[userId]` | Fan card |

## Database workflow
- Schema, RLS and triggers live only in `apps/web/supabase/migrations/*.sql` (timestamped, append-only).
- Every push touching `apps/web/supabase/**` runs `web-db.yml`. It starts a fresh local Postgres (Supabase CLI), applies all migrations, runs the pgTAP tests in `supabase/tests/database`, and regenerates `src/lib/supabase/database.types.ts` (committed by the bot, then web CI re-runs).
- Engineering call (2026-10-11): no ORM. supabase-js + generated types gives typed queries with RLS enforced by the database for every caller. An ORM over a direct connection would bypass RLS and need the DB password in the app.
- Applying a migration to the real projects: SQL editor on **staging** → verify → **production** (owner clicks Run on production).
