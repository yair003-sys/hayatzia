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
Next.js 16 App Router + TypeScript strict + Tailwind v4, Supabase (Postgres + RLS + Realtime + Storage + Auth) through supabase-js typed by generated `database.types.ts`, Vercel. Follow the official Next.js docs (https://nextjs.org/docs): Server Components first, Cache Components (`'use cache'` + `cacheLife` + `cacheTag`), `<Suspense>` around runtime data, Server Actions for mutations, `proxy.ts` for session refresh only. Architecture: `docs/ARCHITECTURE.md`. Conventions: `docs/CONVENTIONS.md`.

## Sandbox limitation: CI is the build machine
The Claude sandbox cannot reach the npm registry, and GitHub's raw job logs (blob storage) are blocked too.
- **Verify:** push to `main` (or dispatch `web-ci.yml`). It runs install → typecheck → lint → unit tests → build → Playwright smoke. Watch with `gh run list/view -R yair003-sys/hayatzia --workflow web-ci.yml`. A green run is the evidence that the code works.
- **Read failures:** every step runs through `apps/web/scripts/ci-step.sh`, which re-emits the output tail as an annotation. Read it with:
  `JID=$(gh api repos/yair003-sys/hayatzia/actions/runs/<run>/jobs -q '.jobs[0].id'); CR=$(gh api repos/yair003-sys/hayatzia/actions/jobs/$JID -q .check_run_url | sed 's#.*/##'); gh api repos/yair003-sys/hayatzia/check-runs/$CR/annotations -q '.[]|.title+"\n"+.message'`
- **Add or update packages:** dispatch `web-deps.yml` with `inputs[packages]` (and `inputs[dev]=true` for dev deps). It commits exact versions + lockfile to `main` and re-runs CI. Never hand-edit versions in `package.json`.
- Pinned on purpose: TypeScript 6.x (typescript-eslint does not support TS 7 yet), ESLint 9.

## Standing technical rules
- Security rules live in code: legacy `firestore.rules` (publish in the Firebase console after every change); new app RLS in SQL migrations (`apps/web/supabase/migrations`), covered by pgTAP tests in `apps/web/supabase/tests` that run in CI (`web-db.yml`) on a fresh local database. Apply a migration to staging, verify, then production.
- Private messages are end-to-end encrypted. Never add a path that sends their plaintext to the server.
- Demo or sample content must always be labelled as such.
- Always think about scale: indexes for every query, keyset pagination, no N+1, counters by trigger, media through Storage + CDN.
