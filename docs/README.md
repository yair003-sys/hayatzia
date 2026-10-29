# Docs map

| File | What it is | When to read |
|---|---|---|
| `../CLAUDE.md` | Standing rules for every session | Always, first |
| `ONBOARDING.md` | Developer "start here": setup, run locally, repo tour, workflow, CI, first change | First day for a new engineer |
| `ARCHITECTURE.md` | How the new app is built: layers, folders, rendering, data flow | Before touching `apps/web` |
| `CONVENTIONS.md` | Code style, naming, patterns, testing, git | Before writing code |
| `DATA_MODEL.md` | Database tables, relations, RLS, triggers, indexes | Before touching the DB |
| `ENVIRONMENTS.md` | local / preview / production, env vars, secrets | Before running anything against a service |
| `BRAND.md` | the onefan name, colours, logo and icons | Before touching colours, icons or the app name |
| `ROADMAP.md` | Migration phases and status | To pick the next piece of work |
| `RIDE_SAFETY.md` | Ride safety: what the app enforces and the incident procedure (Hebrew, for the owner and the lawyer) | When a ride harm report arrives, or before changing rides |
| `load-test-2026-10-17.md` | Local 50,000-fan load test (`web-load-local.yml`): results, bottlenecks, the fixes (migration 20261017090000 + app) and before/after numbers; Hebrew summary on top | Before scaling work or choosing the Supabase plan |
| `perf-round-2.md` | Performance round 2: what is cached (tag, lifetime, which action refreshes it), what is deliberately not cached and why, client JS findings | Before adding a cache or touching a cached read |
| `security-fixes-2026-10-17.md` | Security review batch (branch `sec-fixes`): ride-harm abuse, push allowlist + delivery lease, DM request enumeration, women-only gender, upload caps, group spam, sign-out push — each with the fix and the test that proves it | Before touching rides safety, push, DMs/groups or storage policies |
| `superpowers/specs/` | Approved designs (the "why") | When starting a phase |
| `superpowers/plans/` | Step-by-step implementation plans | When executing a phase |
| `README.he.md` | Plain-Hebrew overview for the owner | When explaining to Yair |
| `COMPANY.md` | Company hub (Hebrew): open tasks, decisions log, accounts, documents, done list | Every session; update it whenever a task ends, a task is added or a decision is made |

Keep these files current. When code and docs disagree, fix the docs in the same commit.
