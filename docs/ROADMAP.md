# Roadmap: migration to Next.js

Design: `superpowers/specs/2026-10-11-nextjs-platform-design.md`. Each phase gets a plan in `superpowers/plans/` before work starts.

| Phase | Scope | Status |
|---|---|---|
| P0 Foundation | Docs, superpowers, Next.js 16 skeleton (TS strict, Tailwind v4, App Router, Cache Components), design tokens, RTL shell + tab routes, env validation, CI | **done** (CI green: typecheck, lint, unit, build, e2e) |
| P1 Core | Supabase staging + production, schema + RLS, Google sign-in, onboarding (team lock + nick), teams/players seed, fixtures/standings ingest, matches pages, Vercel deploy | **in progress**: both DBs live with core schema + 14 teams / 391 players (lock verified on staging); matches + standings pages, Supabase clients, Google sign-in + onboarding code done (CI green). Remaining: Vercel project, Google OAuth client, env vars, ingest into Postgres |
| P2 Community | Team chat (realtime), match rooms, Square (Storage, 24h expiry, view-once, likes/respects/comments), stand photos, ratings | |
| P3 Private & safety | E2EE DMs (port tested crypto), phone sign-in (SMS provider), reports + moderation, rate limits, Sentry | |
| P4 Growth | Trips, events, market, PWA install + push notifications, analytics, load test | |
| P5 Cutover | Move remaining data, domain, legacy → redirect | |

## Open owner decisions
1. Create free Supabase and Vercel accounts (GitHub sign-in); Claude completes setup in the browser.
2. OK for the 2 current Firebase users to sign up again.
3. At launch: Supabase Pro ($25/mo) + Vercel Pro ($20/mo); SMS ≈ ₪0.7 each.

## Known upcoming
- 2026-10-14: Next.js out-of-band security release for upstream dependencies. Upgrade the same day.
