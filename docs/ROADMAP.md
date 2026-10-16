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
| Home in the legacy look | 4 stages (owner, 2026-10-12): 1 home · 2 stand photos → Square · 3 predictions → Matches · 4 player of the match, "הייתי שם", stand songs | **all 4 stages done** (2026-10-12/13): 1 home (`superpowers/specs/2026-10-12-stand-home-design.md`), 2 Square reels with a league tab and a club tab (team posts replace stand photos; photos shrunk before upload), 3 predictions in Matches (`superpowers/specs/2026-10-12-predictions-design.md`, no first-scorer bonus until the paid API). On staging + production. Stage 4 (check-in by location ≤ 500 m, player of the match 1–10, stand songs by the club's fan representative) on staging + production (production migration run by the owner 2026-10-13) |
| Messages like Telegram + groups | Inbox with previews and unread counters, small (≤ 20) invite-only end-to-end encrypted groups (spec `superpowers/specs/2026-10-13-messages-groups-design.md`) | **done** (2026-10-13): on staging + production (both migrations run by the owner 2026-10-13, merged to main) |
| Notifications (goals, full time, messages) | Spec `superpowers/specs/2026-10-13-notifications-design.md`, plan `superpowers/plans/2026-10-13-notifications.md` | **built on branch `notifications`, awaiting owner approval**; one migration `20261013120000_notifications.sql` pending on staging and production; needs `ALERTS_SECRET` + `APP_URL` (see `ENVIRONMENTS.md`) |
| P5 Cutover | Move remaining data, domain, legacy → redirect | |

## Open owner decisions
0. Done 2026-10-12: the new app is renamed **onefan** with the owner's logo and colours (see `docs/BRAND.md`).
1. P5 cutover: when to point fans to the new site, and whether to buy a domain (otherwise `hayatzia-flame.vercel.app`).
2. OK for the current Firebase users to sign up again (legacy data is local/demo apart from a few real profiles).
3. At launch: Supabase Pro ($25/mo per project) + Vercel Pro ($20/mo); API-Football Pro ($19/mo) for the current season; SMS provider for the phone check; Sentry account.
4. Phone check (owner, 2026-10-13): sign-up step 2 is shown with "בקרוב". To switch it on: SMS provider in Supabase Auth, link the phone to the Google account (`updateUser({ phone })` + `verifyOtp` type `phone_change`), make it required before the club step, and keep one phone per account (Supabase already refuses a phone that belongs to another user).
5. Legal (2026-10-15, branch `legal`): `/terms`, `/privacy` and `/accessibility` **drafted, lawyer review pending**
   (each page says "טיוטה – בבדיקה משפטית"; remove the note after review). Minimum age 16; the operator is named
   "מפעיל השירות" (private individual, no company yet). Sign-up requires the 16+ / terms / privacy checkbox (enforced in
   `createProfileAction`). "מחיקת החשבון" in "הכרטיס שלי" deletes the auth user (cascade) and the fan's Storage files.
   **Contact email pending**: set `LEGAL_CONTACT_EMAIL` in `apps/web/src/lib/legal.ts`; until then the pages point to
   the in-app report button. Also open: an accessibility coordinator's name/contact, and a general in-app "contact us"
   (today a request needs a report target).

## Security review (2026-10-15)
Done and live (migration `20261015090000_security_hardening` on staging and production; `tests/database/security.test.sql`):
message-notification abuse, view-once files, block probing, forged join date, anonymous profiles, anon-executable
functions (CI fails on any new one), push endpoint allow-list + cap + timeout, security headers, trip seats race,
decline push across a block, DM key size, error logging, web-deps injection, public ingest logs. Legacy: Square /
gallery stored XSS filtered in index.html (live).
Owner actions still open: publish `firestore.rules` in the Firebase console; delete test phone +972 50-000-0001;
check production Supabase Auth (email sign-up and anonymous sign-ins off unless needed).
Later: enforce phone verification in the database once SMS is chosen; check-in location is self-reported; CI jobs run
installs with a write token (split jobs, `persist-credentials: false`, pin actions, protect `main`).

## Europe phase (recorded 2026-10-15, not built)
Each fan picks two clubs: the Israeli one and one foreign club. Owner's decision: **both are locked forever**. Communities
are keyed by club and country (e.g. "אוהדי ברצלונה בישראל").

## Notes for the next session
- All migrations through `20261013090000_fan_card` are applied on staging and production (2026-10-13).
- All migrations through `20261013110000_dm_groups_blocks` are applied on staging and production (2026-10-13).
- All migrations through `20261014150000_home` (notifications, activity bell, fan lineups, home redesign) are applied on staging and production (2026-10-14).
- Club fan representatives (`club_reps`): none yet — the owner names them; add by SQL until an admin screen exists.
- Staging demos: `web-demo-match.yml` (crowd verdict), `web-demo-predictions.yml` (needs the demo fans from the first).
- Presence joins take ~2 s on the free staging DB, ~30 s while the demo match loads it: one more reason for Pro + compute before launch.
- League data stays on season 2024 for now (owner, 2026-10-12): "Trips" shows no upcoming matches until the API plan changes.
- Owner's own production profile has no team yet (he chooses).
- Preview deployments have the staging `SUPABASE_SECRET_KEY` (rotated 2026-10-14) and send notifications on staging; GitHub reaches previews through the Vercel automation bypass.
- Next.js 16.4.1 security update (2026-10-14 advisory: 2 Critical incl. RCE with Cache Components, 1 High DoS on Server Actions) applied 2026-10-15 via web-deps; eslint-config-next 16.4.1.
- Before launch: legal pages reviewed by a lawyer and the contact email published (see open decision 5).
- Ride safety pack (2026-10-15, branch `ride-safety`, migration `20261015220000_ride_safety`): 18+, gender, women-only
  rides, public pickup, trust line, ratings, share, safety screen, harm report → immediate ride suspension + admin push.
  Apply the migration to staging, verify, then production. **The lawyer reviews the incident procedure in
  `docs/RIDE_SAFETY.md` and terms section 6.** When SMS exists, turn on `rides_require_phone` (see `docs/RIDE_SAFETY.md`).
- League-wide DMs (2026-10-16, branch `league-dms`, migration `20261016100000_league_dms`, spec
  `superpowers/specs/2026-10-16-league-dms-design.md`): 1:1 threads open across clubs as message requests (one message
  before acceptance, accept or block), request setting, daily caps, personal QR code (`/inbox/qr`, `/add/<code>`),
  chat avatar → private message, birth date at sign-up (16+) and a one-time prompt; rides read 18+ from it; admins see
  the most-blocked fans. **Built, CI green; waiting for staging, the owner's check at phone size, then production.**
- Ride verification + emergency button (2026-10-16, branch `ride-verification`, migration
  `20261016200000_ride_verification`, spec `superpowers/specs/2026-10-16-ride-verification-emergency-design.md`, plan
  `superpowers/plans/2026-10-16-ride-verification-emergency.md`): ID + face scan for everyone in a ride, licence (≥ 2
  years) and a registry-checked car for drivers, duplicate-identity fingerprint, 3 attempts + admin reset, "מאומת" badge,
  car on the card and plate to accepted riders, emergency button (tel:100 + admin push + open incident that locks the
  trip). Gates behind `rides_require_verification` (off). Mock provider with a labelled demo path on staging.
  **Built, CI green; waiting for review, staging, the owner's check at phone size, then production.** Before turning
  the switch on: the owner opens a provider account (a real adapter + `VERIFICATION_WEBHOOK_SECRET`,
  `VERIFICATION_FINGERPRINT_SECRET` in Vercel Production), and the lawyer reviews the privacy text.
- Before launch: add the owner as admin on staging and production (SQL editor, once per project: `insert into public.app_admins (user_id) select id from auth.users where email = '<owner email>';`), then check that "דיווחים פתוחים" shows in "הכרטיס שלי".
- Before launch: clean the owner's test likes, ratings, lineups and posts in production; Vercel account 2FA; player photos once a licensed source exists.

## Load test results (staging, free plan, direct PostgREST reads of the league data, uncached)
| Peak simultaneous fans | Requests | Median | p95 | Failed |
|---|---|---|---|---|
| 200 | 30,909 | 155 ms | 181 ms | 0% |
| 1,000 | 21,468 | 209 ms | timeouts (60 s) | 22% |
Reading: the free (nano) database saturates between 200 and 1,000 fans hitting it directly at once. In the app the league pages do not hit it per fan (`'use cache'` + `cacheLife('minutes')` on Vercel), so this path is safe. Per-fan data (chats, Square, DMs) does hit the database: before launch move both projects to Supabase Pro and size compute (Small or larger), then rerun `web-load.yml` with peak 1000+.

## Known upcoming
- 2026-10-14: Next.js out-of-band security release for upstream dependencies. Upgrade the same day.
