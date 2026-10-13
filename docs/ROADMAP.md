# Roadmap: migration to Next.js

Design: `superpowers/specs/2026-10-11-nextjs-platform-design.md`. Each phase gets a plan in `superpowers/plans/` before work starts.

| Phase | Scope | Status |
|---|---|---|
| P0 Foundation | Docs, superpowers, Next.js 16 skeleton (TS strict, Tailwind v4, App Router, Cache Components), design tokens, RTL shell + tab routes, env validation, CI | **done** (CI green: typecheck, lint, unit, build, e2e) |
| P1 Core | Supabase staging + production, schema + RLS, Google sign-in, onboarding (team lock + nick), teams/players seed, fixtures/standings ingest, matches pages, Vercel deploy | **done**: both DBs live, Google sign-in on production, onboarding, league data in Postgres (auto ingest), matches pages read Postgres with legacy JSON fallback, CI migration + pgTAP job, generated DB types. Open check: `/matches` reading Postgres after the owner picks a team |
| P2 Community | Team chat (realtime), match rooms, Square (Storage, 24h expiry, view-once, likes/respects/comments), stand photos, ratings | **done** (2026-10-11): all live on staging + production; private Broadcast channels, server-stamped rows, rate limits, hourly cleanup; 75 pgTAP tests green |
| P3 Private & safety | E2EE DMs (port tested crypto), phone sign-in (SMS provider), reports + moderation, rate limits, Sentry | **done** except two owner-gated items: E2EE DMs (browser-only crypto, ported 1:1, tested), blocks (hide content everywhere), reports (write-only), DB rate limits, in-app-browser note. Phone sign-in code ready behind `NEXT_PUBLIC_PHONE_AUTH=off` (owner chose Google-only for now, 2026-10-12). Sentry: needs an account |
| P4 Growth | Trips, events, market, PWA install + push notifications, analytics, load test | **done** (2026-10-12): trips/events/market live on both projects; installable app (manifest, icons, notification-only service worker); Web Push for private messages and trip requests (no message content in notifications; VAPID generated in the owner's browser); Vercel Web Analytics (Hobby) + Speed Insights; k6 load test on staging (see below). 112 pgTAP tests green |
| Crowd verdict | Live polls inside the match room (spec `superpowers/specs/2026-10-12-crowd-verdict-design.md`) | **built** (2026-10-12): on staging + production DBs; tested on the staging demo match; live data needs the paid API (5-second poller, owner's later step) |
| Home in the legacy look | 4 stages (owner, 2026-10-12): 1 home · 2 stand photos → Square · 3 predictions → Matches · 4 player of the match, "הייתי שם", stand songs | **stages 1–3 done** (2026-10-12): 1 home (`superpowers/specs/2026-10-12-stand-home-design.md`), 2 Square reels with a league tab and a club tab (team posts replace stand photos; photos shrunk before upload), 3 predictions in Matches (`superpowers/specs/2026-10-12-predictions-design.md`, no first-scorer bonus until the paid API). On staging + production. Stage 4 (check-in by location ≤ 500 m, player of the match 1–10, stand songs by the club's fan representative) built and on staging; production migration `20261012080000_stage4` loaded for the owner, not yet confirmed run |
| P5 Cutover | Move remaining data, domain, legacy → redirect | |

## Open owner decisions
0. Done 2026-10-12: the new app is renamed **onefan** with the owner's logo and colours (see `docs/BRAND.md`).
1. P5 cutover: when to point fans to the new site, and whether to buy a domain (otherwise `hayatzia-flame.vercel.app`).
2. OK for the current Firebase users to sign up again (legacy data is local/demo apart from a few real profiles).
3. At launch: Supabase Pro ($25/mo per project) + Vercel Pro ($20/mo); API-Football Pro ($19/mo) for the current season; SMS provider for the phone check; Sentry account.
4. Phone check (owner, 2026-10-13): sign-up step 2 is shown with "בקרוב". To switch it on: SMS provider in Supabase Auth, link the phone to the Google account (`updateUser({ phone })` + `verifyOtp` type `phone_change`), make it required before the club step, and keep one phone per account (Supabase already refuses a phone that belongs to another user).
5. Terms of use and privacy pages before launch (the sign-up page does not mention them until they exist).

## Notes for the next session
- All migrations through `20261012070000_predictions` are applied on staging and production; `20261012080000_stage4` on staging (production pending the owner's Run).
- Club fan representatives (`club_reps`): none yet — the owner names them; add by SQL until an admin screen exists.
- Staging demos: `web-demo-match.yml` (crowd verdict), `web-demo-predictions.yml` (needs the demo fans from the first).
- Presence joins take ~2 s on the free staging DB, ~30 s while the demo match loads it: one more reason for Pro + compute before launch.
- League data stays on season 2024 for now (owner, 2026-10-12): "Trips" shows no upcoming matches until the API plan changes.
- Owner's own production profile has no team yet (he chooses).
- Preview deployments have no `SUPABASE_SECRET_KEY`, so they do not send notifications (by design for now).

## Load test results (staging, free plan, direct PostgREST reads of the league data, uncached)
| Peak simultaneous fans | Requests | Median | p95 | Failed |
|---|---|---|---|---|
| 200 | 30,909 | 155 ms | 181 ms | 0% |
| 1,000 | 21,468 | 209 ms | timeouts (60 s) | 22% |
Reading: the free (nano) database saturates between 200 and 1,000 fans hitting it directly at once. In the app the league pages do not hit it per fan (`'use cache'` + `cacheLife('minutes')` on Vercel), so this path is safe. Per-fan data (chats, Square, DMs) does hit the database: before launch move both projects to Supabase Pro and size compute (Small or larger), then rerun `web-load.yml` with peak 1000+.

## Known upcoming
- 2026-10-14: Next.js out-of-band security release for upstream dependencies. Upgrade the same day.
