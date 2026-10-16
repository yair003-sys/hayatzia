# Docs map

| File | What it is | When to read |
|---|---|---|
| `../CLAUDE.md` | Standing rules for every session | Always, first |
| `ARCHITECTURE.md` | How the new app is built: layers, folders, rendering, data flow | Before touching `apps/web` |
| `CONVENTIONS.md` | Code style, naming, patterns, testing, git | Before writing code |
| `DATA_MODEL.md` | Database tables, relations, RLS, triggers, indexes | Before touching the DB |
| `ENVIRONMENTS.md` | local / preview / production, env vars, secrets | Before running anything against a service |
| `BRAND.md` | the onefan name, colours, logo and icons | Before touching colours, icons or the app name |
| `ROADMAP.md` | Migration phases and status | To pick the next piece of work |
| `RIDE_SAFETY.md` | Ride safety: what the app enforces and the incident procedure (Hebrew, for the owner and the lawyer) | When a ride harm report arrives, or before changing rides |
| `superpowers/specs/` | Approved designs (the "why") | When starting a phase |
| `superpowers/plans/` | Step-by-step implementation plans | When executing a phase |
| `README.he.md` | Plain-Hebrew overview for the owner | When explaining to Yair |
| `COMPANY.md` | Company hub (Hebrew): open tasks, decisions log, accounts, documents, done list | Every session; update it whenever a task ends, a task is added or a decision is made |

Keep these files current. When code and docs disagree, fix the docs in the same commit.
