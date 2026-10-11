# היציע on Next.js: platform design

Status: **draft for owner approval** · Author: Claude (owner: Yair) · Date: 2026-10-11

## 1. Intent

היציע is a community app for Ligat Ha'Al fans. Each club has a private, verified fan community: team chat, stand photos, player ratings, trips, events, a fan market. Fans of all clubs meet in a shared, short-lived feed called the Square (הכיכר). Private messages are end-to-end encrypted.

Today it is one hand-written HTML file (≈4,300 lines) on GitHub Pages, backed by Firebase (Firestore + Auth) and a GitHub Action that pulls API-Football every 10 minutes. It works, but it cannot grow. There is no type system, no components, no server, media is stored as base64 inside database documents, and every feature lives in the same file.

The goal of this migration is a platform that can carry a real league-wide community: hundreds of thousands of fans, match-day spikes, video, moderation. It must stay pleasant for one developer, a Claude agent, to extend safely.

## 2. Goals, non-goals, anti-goals

**Goals**
- Feature parity with the current app, then growth: same product, rebuilt on a scalable foundation.
- Next.js (App Router) + TypeScript (strict) + Tailwind CSS, following the official Next.js 16 docs (Cache Components, Partial Prerendering, Server Components first).
- A relational database with row-level security as the single source of truth. Realtime where the product is live (chat, match rooms, feed counters).
- Real media storage (images and video) with a CDN. No more base64 in documents.
- Strict separation of environments: local, preview, production (owner's standing rule).
- Everything documented in Markdown, so any future session continues precisely.

**Non-goals (for now)**
- Native iOS/Android apps. The web app becomes installable (PWA) first; native wrappers come later if needed.
- Payments or fan-funded player purchases. These are a future vision and need legal review first.
- Multi-language. The app is Hebrew and RTL only, structured so i18n can be added later.

**Anti-goals (failure even if it "works")**
- The live site breaks or loses users during the migration.
- Test data reaches production, or production credentials reach a local or test run.
- Private messages readable by the server or the owner.
- Fake or simulated content presented as real. Demo content must always be labelled.
- A codebase only its author can change: hidden coupling, no types, no tests.

## 3. Constraints

- Owner is not a programmer: all owner-facing communication is in Hebrew and plain words.
- Budget: free tiers until launch. Paid tiers (≈$25 + $20/month) only when there are real users.
- The development sandbox cannot reach the npm registry. Dependencies are installed and builds verified in GitHub Actions, which has open internet.
- The current site (GitHub Pages + Firebase) stays live until the new one reaches parity (strangler migration).
- Hebrew/RTL first. Mobile first, since almost every fan is on a phone at the stadium.

## 4. Decisions

### 4.1 Framework: Next.js 16 App Router (owner's decision)
- Next.js 16.x (16.4 at the time of writing), React 19, TypeScript strict, Turbopack.
- `cacheComponents: true` and `partialPrefetching: true`: static shells from the CDN, with dynamic parts streamed behind `<Suspense>`.
- Server Components by default; Client Components only at interactive leaves.
- Mutations through Server Actions, validated with Zod. Route Handlers only for webhooks, cron and integrations.
- `proxy.ts` (Next 16's renamed middleware) only for refreshing the auth session, never for authorization logic.

### 4.2 Database: PostgreSQL on Supabase (Claude's call)
Why Postgres over staying on Firestore:

| Need | Firestore (today) | Postgres on Supabase |
|---|---|---|
| Relations: fans, teams, matches, players, ratings | denormalised documents, client-side joins | real joins, foreign keys, constraints |
| Aggregates: rating averages, standings, counters | hand-written counters with complex security rules | triggers and SQL, transactional |
| Team privacy | security rules per path, with an extra read per check | Row Level Security with one `my_team()` function |
| Media | base64 in documents (1 MB cap, expensive reads) | Storage buckets + CDN, video included |
| Feeds at scale | per-document read billing; feeds get expensive | indexed keyset pagination, flat cost |
| Scheduled work: 24h expiry, cleanup | client-side sweeping | `pg_cron` inside the database |
| Realtime chat | excellent | Realtime (Postgres changes + Broadcast + Presence) |
| Typed access from Next.js | SDK with loose types | Drizzle ORM: schema in TypeScript, migrations in git |
| Lock-in | proprietary | standard Postgres, portable |

Supabase bundles Postgres, Auth (Google; phone via an SMS provider), Realtime, Storage and cron in one place. Two free projects map exactly to **staging** and **production**. Local development uses the Supabase CLI (Docker) or a mocked client in tests.

Trade-offs accepted: free projects pause after 7 days without traffic (production moves to Pro at launch), and phone SMS needs a provider such as Twilio, which costs about the same per SMS as Firebase.

### 4.3 Hosting: Vercel (Claude's call)
Native Next.js host: Cache Components, PPR, image optimisation and preview deployments per push. Hobby plan now, Pro when the app turns commercial. The GitHub Pages site keeps serving the legacy app until cutover.

### 4.4 Libraries (Claude's call)
| Area | Choice | Why |
|---|---|---|
| DB access | `drizzle-orm`, `drizzle-kit`, `postgres` | typed schema, SQL-first, migrations as code, RLS policies in schema |
| Auth / Realtime / Storage | `@supabase/supabase-js`, `@supabase/ssr` | official SSR cookie sessions for App Router |
| Validation | `zod` | one schema for forms, actions and env |
| Env safety | `@t3-oss/env-nextjs` | build fails on missing or invalid env; separates server and client vars |
| Server Actions | `next-safe-action` | typed, validated actions with middleware for auth and rate limits |
| URL state | `nuqs` | tabs and filters live in the URL, so a refresh keeps the screen |
| Client data | `@tanstack/react-query` | cache, infinite feeds, optimistic likes, realtime patching |
| UI primitives | shadcn/ui (Radix) + `lucide-react` | accessible components we own, RTL-ready |
| Sheets / toasts | `vaul`, `sonner` | native-feeling bottom sheets and toasts (today's UX) |
| Motion | `motion` | the micro-interactions the app already has |
| Forms | `react-hook-form` + `@hookform/resolvers` | performant forms on Zod schemas |
| Dates | `date-fns` (he locale) | relative times, kick-off countdowns |
| PWA | `@serwist/next` | installable app, offline shell, later push notifications |
| Rate limiting | `@upstash/ratelimit` + `@upstash/redis` | anti-spam on chat, posts and reports (phase 3) |
| Observability | `@sentry/nextjs`, Vercel Analytics | errors and Web Vitals (phase 3) |
| Testing | `vitest`, `@testing-library/react`, `@playwright/test`, `msw` | unit, component and e2e |
| Quality | ESLint (flat config, `eslint-config-next`), Prettier + tailwind plugin, `typescript` strict | consistent code |

Encryption stays on the browser's built-in WebCrypto (ECDH P-256 + HKDF + AES-256-GCM, per-device keys), which is the scheme the current app already uses and has tested.

## 5. Architecture

### 5.1 Repository layout (strangler, no disruption)
```
/                      legacy app (index.html, data/, scripts/), still served by GitHub Pages
/apps/web              the new Next.js app (Vercel root directory)
/apps/web/supabase     SQL migrations, seed, RLS, cron (generated by drizzle-kit + hand-written SQL)
/docs                  architecture, conventions, data model, environments, roadmap, specs, plans
/.claude/skills        superpowers methodology (vendored, MIT)
/.github/workflows     legacy data + Pages deploy; web CI
```

### 5.2 Application structure: feature-first
```
apps/web/src/
  app/                         routes only: thin, compose features
    (public)/                  landing, login, onboarding
    (app)/                     signed-in shell with tab bar
      stand/  matches/[id]/  square/[[...clip]]/  inbox/[thread]/  me/
      team/(chat|trips|events|market)/
    api/                       route handlers: webhooks, cron, ingest
    layout.tsx  globals.css  manifest.ts
  features/<feature>/
    components/                UI for the feature (server + client)
    server/queries.ts          read paths ('use cache' where shared)
    server/actions.ts          next-safe-action mutations
    hooks/                     client hooks (react-query, realtime)
    schema.ts                  Zod schemas and types for the feature
  db/schema/                   Drizzle tables and RLS policies, one file per domain
  lib/                         supabase clients, env, utils, crypto (e2e)
  components/ui/               shadcn primitives
  styles/                      design tokens (CSS variables + Tailwind theme)
```
Features: `auth`, `profile`, `teams`, `matches`, `standings`, `team-chat`, `square`, `photos`, `ratings`, `dm` (E2EE), `trips`, `events`, `market`, `reports`.

### 5.3 Rendering and caching strategy
| Data | Who sees it | Strategy |
|---|---|---|
| Teams, squads, fixtures, standings | everyone | `'use cache'` + `cacheLife('minutes')` + `cacheTag('fixtures')`; ingest calls `revalidateTag` |
| Match room messages, team chat | team / match fans | client realtime subscription; first page server-rendered behind `<Suspense>` |
| Square feed | all fans | server first page (keyset), then infinite client query; counters via realtime |
| Profile, my team, unread counts | the user | read `cookies()` inside `<Suspense>`, `use cache: private` where it helps prefetch |
| DMs | two fans | client only (plaintext never leaves the browser) |

Every route renders a static shell (tab bar, headers, skeletons) from the CDN; personal and live parts stream in.

### 5.4 Data model (summary; full DDL in docs/DATA_MODEL.md)
- `teams(id text pk, name, short, colors…)`, `players(id, team_id, number, name, position)`
- `profiles(user_id pk → auth.users, nick, team_id → teams, created_at)`: `team_id` immutable (trigger)
- `fixtures`, `standings`, `lineups`, `match_events`: ingested from API-Football
- `team_messages(id, team_id, user_id, body ≤200, created_at)`: realtime; index `(team_id, created_at desc)`
- `match_messages(id, fixture_id, user_id, side, body, created_at)`: open 30′ before, closed 60′ after
- `clips(id, user_id, team_id, media_path, kind image|video, caption, tags, once, likes_count, respects_count, comments_count, views_count, created_at, expires_at = created_at + 24h)`
  - `clip_likes`, `clip_respects` (only other clubs' fans), `clip_views` (view-once), `clip_comments`; counters kept by triggers
- `team_photos(+ likes, comments)`: team-private
- `player_ratings(player_id, user_id, stars 1–5, review ≤200)`: PK (player, user); `player_rating_stats` maintained by trigger
- `device_keys(user_id, device_id, public_jwk)`, `dm_threads(id, user_a, user_b)`, `dm_messages(thread_id, sender, sender_device, iv, ciphertext, wrapped_keys jsonb)`
- `reports(id, reporter, kind, ref, reason, note)`: insert-only for fans
- later: `trips`, `events`, `market_items`, `notifications`

### 5.5 Security model
- **RLS on every table**, deny by default. `my_team()` is a `security definer` SQL function that reads the caller's profile.
- Team-private tables: `team_id = my_team()`. Square: readable by all signed-in fans, writable as yourself, and respects only from other clubs.
- Team lock: a trigger rejects any update to `profiles.team_id`.
- View-once and 24h expiry are enforced in SQL (RLS hides expired clips; `pg_cron` deletes rows and media).
- DMs: the server stores ciphertext and wrapped keys only. Thread membership is checked by RLS; both fans must be on the same team.
- Secrets: the service role key only in server env (Vercel/GitHub Actions), never with the `NEXT_PUBLIC_` prefix. `@t3-oss/env-nextjs` enforces the split.
- Proxy refreshes sessions only. Authorization lives in RLS and in server code (`getClaims()`).

### 5.6 Environments (owner's standing rule)
| Env | Next.js | Supabase | Data |
|---|---|---|---|
| local | `next dev` | Supabase CLI (Docker) on localhost, or mocked in tests | seed only |
| preview | Vercel preview per push | **staging** project | seed + test accounts |
| production | Vercel production (main) | **production** project | real fans only |
Env vars are per environment in Vercel. The production keys exist only in Vercel's production scope and in GitHub's production environment.

### 5.7 Scale plan
- CDN static shells (PPR), so most page loads never touch the database.
- Indexes on every feed and chat query; keyset pagination, never offset.
- Counters denormalised by triggers, so feeds never count rows.
- Supabase connection pooling (Supavisor, transaction mode) for serverless functions.
- Realtime channels scoped per team and per match, so fans only receive their own rooms. Presence gives true online counts.
- Media: client-side compression, then direct upload to Storage with signed URLs. The server never proxies bytes.
- Ingest: a scheduled job writes fixtures and standings, then calls `revalidateTag`. The API quota is protected by a daily cap (exists today).
- Rate limits (Upstash) on chat, posts, comments and reports before public launch.
- Match-day spike: chat writes are small rows; realtime fan-out is per channel. Load-test before launch (k6, phase 4).

## 6. Migration phases
- **P0 Foundation:** docs, CI, Next.js skeleton, design tokens, RTL shell with tab routes, env validation. *(this session)*
- **P1 Core:** Supabase projects, Drizzle schema + RLS, Google sign-in, onboarding (team lock + nick), teams/players seed, fixtures/standings ingest, matches pages.
- **P2 Community:** team chat (realtime), match rooms, Square (storage, 24h expiry, view-once, likes/respects/comments), stand photos, ratings.
- **P3 Private & safety:** E2EE DMs (port the tested crypto), phone sign-in (SMS provider), reports + moderation view, rate limits, Sentry.
- **P4 Growth:** trips, events, market, PWA install + push, analytics, load test.
- **P5 Cutover:** production data move (very few users today), domain switch, legacy app retired to a redirect.

Each phase gets its own plan in `docs/superpowers/plans/` and ships to preview, then to production.

## 7. Owner decisions (to confirm)
1. **Accounts:** create a free Supabase account and a free Vercel account (sign in with GitHub). Claude then does the setup in the browser, as with Firebase.
2. **Reset:** the 2 current Firebase users sign up again in the new app. Not worth a migration script.
3. **Costs at launch:** Supabase Pro ($25/mo, no pausing) + Vercel Pro ($20/mo) once there are real users; SMS about ₪0.7 each.

## 8. Left to the builder
Component breakdown, exact Tailwind tokens (ported from the current CSS variables), and test granularity are decided in each phase's plan.
