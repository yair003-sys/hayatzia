# Developer onboarding — start here

Welcome. This is the one page that gets a new engineer from a fresh clone to a running app and a first
merged change. It is a map and a quick-start; the deep references it links to are the source of truth.

Read order for your first day: **this page → `ARCHITECTURE.md` → `CONVENTIONS.md` → `DATA_MODEL.md`**.
Everything else in `docs/README.md` is read-when-you-need-it.

---

## 1. What you're working on

**onefan / היציע** is a mobile-first, closed community app for football fans — one club per fan, for life.
The product owner (Yair) is not a programmer: he decides product, engineers decide how it's built. All
user-facing text is Hebrew (RTL); the code, identifiers and these docs are English.

There are **two apps in this repo**, and you need to know which one you're in:

| App | Where | Stack | Status |
|---|---|---|---|
| **New app** (the future) | `apps/web/` | Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase · Vercel | Active development |
| **Legacy app** | repo root (`index.html`, `firestore.rules`, `data/`, `scripts/`) | Static HTML + Firebase/Firestore | In production, being replaced |

Unless a task says otherwise, **you work in `apps/web/`.** The legacy app is only touched for a production
hotfix while the migration finishes (see `ROADMAP.md`).

---

## 2. Prerequisites

- **Node.js 22+** (see `apps/web/package.json` → `engines`). Use `nvm`/`fnm` if you juggle versions.
- **npm** (the repo uses `npm ci` / `package-lock.json` — no pnpm/yarn).
- **Docker** — the local Supabase stack runs in Docker.
- **Supabase CLI** — for the local database, auth, realtime and storage.
- **git** and the **GitHub CLI (`gh`)** — CI is driven and read through `gh` (see §7).

---

## 3. First-time setup

```bash
git clone <repo> && cd hayatzia/apps/web
npm ci                      # exact, lockfile-pinned install
cp .env.example .env.local  # then fill it in — see docs/ENVIRONMENTS.md for every var
supabase start              # local Postgres + Auth + Realtime + Storage; applies ALL migrations
npm run dev                 # http://localhost:3000
```

`supabase start` prints the local URLs and keys; `supabase status` shows them again. Put the local
`API_URL` / `ANON_KEY` into `.env.local` as `ENVIRONMENTS.md` describes.

> **Golden rule #1 — local and production never mix.** Local runs and tests use the local Supabase stack
> (or mocks) only. Never point a script, test or dev server at the production or staging Supabase project,
> and never write test data into them. Full detail: `ENVIRONMENTS.md`.

---

## 4. Everyday commands (run inside `apps/web/`)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run typecheck` | `tsc --noEmit` — strict, `noUncheckedIndexedAccess`, no `any` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit + component), once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e` | Playwright end-to-end (local services / mocks only) |
| `npm run build` | Production build |
| `npm run format` | Prettier |

Database commands use the Supabase CLI: `supabase migration new <name>`, `supabase db reset` (re-apply all
migrations + re-seed locally), `supabase test db` (run the pgTAP security tests).

---

## 5. Repo tour

The full folder map is in `ARCHITECTURE.md` (keep it open). The shape to internalise:

```
apps/web/src/
  app/              Routes only — thin. (public)/ = landing+login+onboarding, (app)/ = signed-in shell, api/ = webhooks/cron.
  features/<name>/   ← almost all the code lives here, one folder per feature
    components/      Feature UI. Server Component by default; 'use client' only at the lowest leaf that needs it.
    server/queries.ts  Reads (cached when shared).
    server/actions.ts  Writes (next-safe-action + Zod, auth re-checked).
    hooks/           Client hooks (realtime, react-query).
    schema.ts        Zod schemas + inferred types — shared by UI and server.
    *.test.ts(x)     Unit/component tests sit next to the code.
  lib/supabase/      client/server/public clients + generated database.types.ts (never hand-edit).
  lib/env.ts         The ONLY place that reads process.env.
apps/web/supabase/
  migrations/*.sql   Schema, RLS, triggers — timestamped, append-only. The DB's source of truth.
  tests/database/    pgTAP security tests (one per area).
docs/                These docs. DATA_MODEL.md = every table/RLS/trigger/index.
```

To find where a feature lives: start at its route in `app/`, which composes a component from `features/<name>/`.

---

## 6. How work gets done

The team uses the **superpowers** workflow (vendored in `.claude/skills/`), the same for a human or an AI pair:

1. **Brainstorm** → a written spec in `docs/superpowers/specs/` (the *why* and the shape).
2. **Plan** → a step-by-step plan in `docs/superpowers/plans/`.
3. **Build test-first (TDD)** → write the failing test, then the code.
4. **Verify before "done"** → CI green, with evidence.

Lighter rules the owner set:
- **Branches are optional.** Small, safe changes commit straight to `main`. Use a branch only for risky or
  multi-day work. (CI still runs on `main`.)
- **Commits**: imperative subject, Hebrew or English, details when useful. Never commit secrets.
- When code and docs disagree, **fix the docs in the same commit.** New table → add a row to `DATA_MODEL.md`.

Full style rules: `CONVENTIONS.md`.

---

## 7. CI is the gatekeeper — and the build machine

All verification runs in GitHub Actions; a **green run is the evidence that work is done.** Watch and read
runs with the `gh` CLI (`gh run list/view -R <owner>/<repo> --workflow <file>`).

| Workflow | When it runs | What it proves |
|---|---|---|
| `web-ci.yml` | push to `main`, or dispatch | install → typecheck → lint → unit tests → build → Playwright smoke |
| `web-db.yml` | changes under `supabase/**` | every migration applies to a **fresh** DB, pgTAP security tests pass, DB types regenerate (committed by the bot) |
| `web-deps.yml` | dispatch | add/update npm packages (commits exact versions + lockfile). **Never hand-edit versions in `package.json`.** |
| `web-load-local.yml` | dispatch | seeds up to 200k fake fans on a throwaway local stack, runs the real app + k6 + UI checks. Finds scale bugs. (`docs/load-test-2026-10-17.md`) |
| `web-migrate` / `web-ingest` / `web-cleanup` / `update` | schedule / dispatch | DB migrate helper, league-data ingest, storage cleanup, league data refresh |

Each CI step streams its output tail as a GitHub **annotation**, so failures are readable without the raw
logs. Read them with the one-liner in `../CLAUDE.md` (§"Sandbox limitation").

> Note for AI/sandbox sessions only: the Claude sandbox can't reach the npm registry, so it verifies by
> pushing and letting CI build. A human on a normal laptop just runs `npm ci` / `npm run build` locally.

---

## 8. The non-negotiables (learn these before your first change)

These are enforced, not suggestions — most are covered by tests that will fail if you break them:

1. **Local ≠ production.** (§3)
2. **Authorization lives in the database.** Every table has RLS; every write goes through a Server Action
   that re-checks `getClaims()`. `proxy.ts` never decides access. RLS is covered by pgTAP tests in
   `supabase/tests/database/`. (`ARCHITECTURE.md` §"Rules of the road", `DATA_MODEL.md`)
3. **Private messages are end-to-end encrypted.** The server only ever stores ciphertext. **Never add a
   path that sends message plaintext to the server.** (`lib/e2e/`)
4. **Think about scale.** Index every query, keyset-paginate every list, counters by trigger (`*_count`),
   no N+1, media through Storage + CDN (rows store the path, never bytes).
5. **A failed read is never shown as data.** Query helpers return `null` (not `0`/`[]`); the screen shows
   "לא הצלחנו לטעון", and an empty state only when the read worked and found nothing.
6. **No `process.env` outside `lib/env.ts`.** The service-role key is server-only.
7. **Server Components by default;** add `'use client'` at the lowest leaf. Writes via Server Actions only.
8. **RTL + tokens.** Tailwind design tokens (`bg-surface`, `text-muted`), logical properties (`ps-*`, `pe-*`),
   never `left`/`right` for layout. Every interactive element is a real button/link with a Hebrew label.

---

## 9. Testing

- **Unit / component**: Vitest + Testing Library, next to the code as `*.test.ts(x)`. `npm test`.
- **Database**: pgTAP in `supabase/tests/database/` — each file tries the forbidden operations and asserts
  they're blocked (RLS, identity, admin-only, rate limits). `supabase test db`, and in CI via `web-db.yml`.
- **End-to-end**: Playwright in `apps/web/tests/` (e.g. `smoke.spec.ts`), local/mocks only. `npm run e2e`.
- **Scale**: the local load test (`web-load-local.yml`) — dispatch it before big scaling work.
- **TDD for logic**: write the failing test first. **CI must be green before claiming done.**

---

## 10. Your first change — two worked paths

**A UI tweak (no DB):**
1. Find the screen's route in `app/`, follow it to `features/<name>/components/`.
2. Change the component (and its `*.test.tsx` first, if it has logic).
3. `npm run typecheck && npm test && npm run build` locally.
4. Commit to `main` (small change) and watch `web-ci.yml` go green.

**A database change:**
1. `supabase migration new <name>` → write the SQL (table + RLS + indexes + any trigger).
2. Add a pgTAP test in `supabase/tests/database/` proving the new boundary holds.
3. Add a row to `docs/DATA_MODEL.md`.
4. `supabase db reset` locally to apply + seed, then `supabase test db`.
5. Push; `web-db.yml` applies it to a fresh DB, runs pgTAP, regenerates types.
6. Apply to the real DB only via **staging → verify → production** (owner runs it on production).

---

## Where everything is

`docs/README.md` is the full map. The ones you'll reach for most: `ARCHITECTURE.md` (structure & data flow),
`CONVENTIONS.md` (style), `DATA_MODEL.md` (the database), `ENVIRONMENTS.md` (local/preview/prod & secrets),
`ROADMAP.md` (what's next), and `COMPANY.md` (the owner's hub — open tasks, decisions, done).
