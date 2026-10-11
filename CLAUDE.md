# היציע: rules for working on this project

Read this first, every session. Then read `docs/README.md` for the map of all docs.

## Talking to the owner
- The owner (Yair) is not a programmer. Reply in **Hebrew only**, in plain words. No English terms unless unavoidable.
- He decides product; Claude decides engineering, and says each engineering call out loud in one plain line.

## Always keep local and production data apart (owner's standing rule)
- Production data is used **only** by the production deployment. Legacy app: `https://yair003-sys.github.io/hayatzia/` (Firebase project `hayatzia-2b0ff`, enforced by the `ENV` switch in `index.html`). New app: Vercel production + the Supabase **production** project.
- Local runs and tests use local or mocked services only (legacy: `?emu=1` + the `demo-hayatzia` project; new app: Supabase CLI locally, or mocks). Previews use the Supabase **staging** project.
- Never point a test, script or local run at production, and never write test data into production. Details: `docs/ENVIRONMENTS.md`.
- Production leftovers to clean before launch: the test phone number `+972 50-000-0001` in Firebase Auth, and the owner's test posts and ratings.

## How we build (superpowers methodology, vendored in `.claude/skills/`)
- New feature or change in behaviour: `brainstorming` → spec in `docs/superpowers/specs/` → `writing-plans` → plan in `docs/superpowers/plans/` → `executing-plans` / `test-driven-development` → `verification-before-completion`.
- Bugs: `systematic-debugging` first.
- The skills refer to each other as `superpowers:<name>`; here they live in `.claude/skills/<name>/`.
- Owner's override: **do not open a branch for every small change, and PRs are optional.** Small, safe changes go straight to `main` with a clear commit. Use a branch only for risky or long work.
- Never claim something works without evidence: tests, CI, or a check on the deployed site.

## Stack (new app in `apps/web`)
Next.js 16 App Router + TypeScript strict + Tailwind v4, Supabase (Postgres + RLS + Realtime + Storage + Auth), Drizzle ORM, Vercel. Follow the official Next.js docs (https://nextjs.org/docs): Server Components first, Cache Components (`'use cache'` + `cacheLife` + `cacheTag`), `<Suspense>` around runtime data, Server Actions for mutations, `proxy.ts` for session refresh only. Architecture: `docs/ARCHITECTURE.md`. Conventions: `docs/CONVENTIONS.md`.

## Sandbox limitation
The Claude sandbox cannot reach the npm registry. Install, typecheck, lint, test and build run in GitHub Actions (`.github/workflows/web-ci.yml`). Push, then read the run with `gh run list/view -R yair003-sys/hayatzia`. A green CI run is the evidence that the code works.

## Standing technical rules
- Security rules live in code: legacy `firestore.rules` (publish in the Firebase console after every change); new app RLS in Drizzle schema + SQL migrations.
- Private messages are end-to-end encrypted. Never add a path that sends their plaintext to the server.
- Demo or sample content must always be labelled as such.
- Always think about scale: indexes for every query, keyset pagination, no N+1, counters by trigger, media through Storage + CDN.
