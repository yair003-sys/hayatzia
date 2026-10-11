# P1: league data into Postgres

**Goal:** fixtures, standings, lineups and events live in Supabase (staging + production). The matches pages read from Postgres, with the legacy JSON as a fallback until cutover.

**Engineering calls**
- **Source stays the legacy pipeline.** `scripts/update.mjs` already pulls API-Football within the free quota and writes `data/*.json`. A second puller would double the API usage. The ingest copies those files into Postgres right after they change.
- **API team ids, not club ids.** Fixtures of past seasons include clubs outside today's 14, so fixtures and standings reference `api_teams(api_id)`. Hebrew names still come from `features/matches/api-teams.ts`.
- **One `fixture_details` row per match** (events and lineups as `jsonb`) instead of normalised `lineups` / `match_events`. The detail page always reads the whole match, so this is a single primary-key read. Nothing queries inside the blob yet. Normalise later if a feature needs to (e.g. player stats).
- **Ingest writes via PostgREST with the project's secret key**, using plain `fetch` and no npm install. The DB password and pooler are not needed. The key is a GitHub *environment* secret per project (staging / production), pasted by the owner.
- **Pure transforms** in `features/matches/ingest/rows.ts`: `toRows(league, details)` builds the rows, and `fromRows(rows)` turns them back into the `League` shape, so callers do not change. Round-trip unit test.
- **Read path:** `getLeague()` reads Postgres through a cookie-less public client (allowed inside `'use cache'`). It falls back to the legacy JSON when Supabase is not configured, on error, or when the tables are still empty.

**Tasks**
- [x] Migration `20261011200000_league_data.sql`:
  - Tables: `api_teams`, `fixtures`, `standings`, `fixture_details`.
  - Indexes, RLS, and a public select policy.
  - Grants: select to `anon` and `authenticated`; all to `service_role`.
- [x] `rows.ts` + `rows.test.ts` (round trip; null scores; group order kept).
- [x] `scripts/ingest-league.ts`:
  - Reads `../../data`, upserts in chunks of 500.
  - Deletes the season's standings rows that weren't touched in this run.
- [x] `lib/supabase/public.ts` + `getLeague` / `getFixtureDetail` read from Postgres, with fallback.
- [x] `.github/workflows/web-ingest.yml`:
  - Triggers: `workflow_dispatch` + `workflow_call`.
  - Matrix over the `staging` and `production` environments.
  - `update.yml` calls it when data changed.
- [x] Apply the migration: staging, verify, then production. Run the ingest. Verify row counts. Check that `/matches` on production is served from Postgres.
