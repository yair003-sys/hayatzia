# Roadmap: migration to Next.js

Design: `superpowers/specs/2026-10-11-nextjs-platform-design.md`. Each phase gets a plan in `superpowers/plans/` before work starts.

| Phase | Scope | Status |
|---|---|---|
| P0 Foundation | Docs, superpowers, Next.js 16 skeleton (TS strict, Tailwind v4, App Router, Cache Components), design tokens, RTL shell + tab routes, env validation, CI | **done** (CI green: typecheck, lint, unit, build, e2e) |
| P1 Core | Supabase staging + production, schema + RLS, Google sign-in, onboarding (team lock + nick), teams/players seed, fixtures/standings ingest, matches pages, Vercel deploy | **in progress**: both DBs live with core schema + 14 teams / 391 players (lock verified on staging); matches + standings pages, Supabase clients, Google sign-in + onboarding code done (CI green). Vercel project live at hayatzia-flame.vercel.app (fra1, env vars per environment, Supabase auth URLs set). Google sign-in works on production (verified). League data in Postgres on both projects (14 api teams, 240 fixtures, 28 standing rows, 8 match details), refreshed automatically; pages read Postgres with legacy JSON fallback. CI `web-db.yml`: every migration applied to a fresh local DB + 17 pgTAP security tests + generated TS types (green). Remaining: owner onboarding check of `/matches` reading Postgres |
| P2 Community | Team chat (realtime), match rooms, Square (Storage, 24h expiry, view-once, likes/respects/comments), stand photos, ratings | **done** (2026-10-11): all live on staging + production; private Broadcast channels, server-stamped rows, rate limits, hourly cleanup; 75 pgTAP tests green |
| P3 Private & safety | E2EE DMs (port tested crypto), phone sign-in (SMS provider), reports + moderation, rate limits, Sentry | **done** except two owner-gated items: E2EE DMs (browser-only crypto, ported 1:1, tested), blocks (hide content everywhere), reports (write-only), DB rate limits, in-app-browser note. Phone sign-in code ready behind `NEXT_PUBLIC_PHONE_AUTH=off` (owner chose Google-only for now, 2026-10-12). Sentry: needs an account |
| P4 Growth | Trips, events, market, PWA install + push notifications, analytics, load test | **done** (2026-10-12): trips/events/market live on both projects; installable app (manifest, icons, notification-only service worker); Web Push for private messages and trip requests (no message content in notifications; VAPID generated in the owner's browser); Vercel Web Analytics (Hobby) + Speed Insights; k6 load test on staging (see below). 112 pgTAP tests green |
| P5 Cutover | Move remaining data, domain, legacy → redirect | |

## Open owner decisions
1. Create free Supabase and Vercel accounts (GitHub sign-in); Claude completes setup in the browser.
2. OK for the 2 current Firebase users to sign up again.
3. At launch: Supabase Pro ($25/mo) + Vercel Pro ($20/mo); SMS ≈ ₪0.7 each.

## Notes for the next session (2026-10-12)
- Production SQL: if `20261012020000_team_life` is not applied yet, load it in the SQL editor (raw file at commit 1fc99b7) and have the owner click Run.
- League data is season 2024 (free API plan), so "Trips" shows no upcoming matches until the season variable/plan changes. Decide with the owner.
- Still owner-gated: SMS provider (chose Google-only for now), Sentry account, Supabase/Vercel Pro at launch.
- Owner's own production profile has no team yet (he chooses).

## Load test results (staging, free plan, direct PostgREST reads of the league data, uncached)
| Peak simultaneous fans | Requests | Median | p95 | Failed |
|---|---|---|---|---|
| 200 | 30,909 | 155 ms | 181 ms | 0% |
| 1,000 | 21,468 | 209 ms | timeouts (60 s) | 22% |
Reading: the free (nano) database saturates between 200 and 1,000 fans hitting it directly at once. In the app the league pages do not hit it per fan (`'use cache'` + `cacheLife('minutes')` on Vercel), so this path is safe. Per-fan data (chats, Square, DMs) does hit the database: before launch move both projects to Supabase Pro and size compute (Small or larger), then rerun `web-load.yml` with peak 1000+.

## Known upcoming
- 2026-10-14: Next.js out-of-band security release for upstream dependencies. Upgrade the same day.
