# Roadmap: migration to Next.js

Design: `superpowers/specs/2026-10-11-nextjs-platform-design.md`. Each phase gets a plan in `superpowers/plans/` before work starts.

| Phase | Scope | Status |
|---|---|---|
| P0 Foundation | Docs, superpowers, Next.js 16 skeleton (TS strict, Tailwind v4, App Router, Cache Components), design tokens, RTL shell + tab routes, env validation, CI | **done** (CI green: typecheck, lint, unit, build, e2e) |
| P1 Core | Supabase staging + production, schema + RLS, Google sign-in, onboarding (team lock + nick), teams/players seed, fixtures/standings ingest, matches pages, Vercel deploy | **in progress**: both DBs live with core schema + 14 teams / 391 players (lock verified on staging); matches + standings pages, Supabase clients, Google sign-in + onboarding code done (CI green). Vercel project live at hayatzia-flame.vercel.app (fra1, env vars per environment, Supabase auth URLs set). Google sign-in works on production (verified). League data in Postgres on both projects (14 api teams, 240 fixtures, 28 standing rows, 8 match details), refreshed automatically; pages read Postgres with legacy JSON fallback. CI `web-db.yml`: every migration applied to a fresh local DB + 17 pgTAP security tests + generated TS types (green). Remaining: owner onboarding check of `/matches` reading Postgres |
| P2 Community | Team chat (realtime), match rooms, Square (Storage, 24h expiry, view-once, likes/respects/comments), stand photos, ratings | **done** (2026-10-11): all live on staging + production; private Broadcast channels, server-stamped rows, rate limits, hourly cleanup; 75 pgTAP tests green |
| P3 Private & safety | E2EE DMs (port tested crypto), phone sign-in (SMS provider), reports + moderation, rate limits, Sentry | **done** except two owner-gated items: E2EE DMs (browser-only crypto, ported 1:1, tested), blocks (hide content everywhere), reports (write-only), DB rate limits, in-app-browser note. Phone sign-in code ready behind `NEXT_PUBLIC_PHONE_AUTH=off` (owner chose Google-only for now, 2026-10-12). Sentry: needs an account |
| P4 Growth | Trips, events, market, PWA install + push notifications, analytics, load test | **in progress**: trips (seat requests, driver approves, never over seats), events (going), market (no tickets, photo, sold) live on staging; production migration `team_life` waiting for the owner's Run (2026-10-12 00:15). 108 pgTAP tests green. Next: PWA install + push, analytics, load test |
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

## Known upcoming
- 2026-10-14: Next.js out-of-band security release for upstream dependencies. Upgrade the same day.
