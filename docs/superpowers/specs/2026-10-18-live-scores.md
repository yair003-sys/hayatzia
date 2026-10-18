# Live scores every minute (design)

**Date:** 2026-10-18 · **Status:** built on branch `live-scores`, not merged.

## Problem

The GitHub updater (`scripts/update.mjs`) refreshes match data every ~10 minutes. For a live match that is too
slow: a goal can take ten minutes to reach the app and the push notification. We want goal pushes within ~1 minute
while a match is actually being played, without blowing the API-Football budget or changing anything else.

## Decision

Add a **parallel, cheap, every-minute LIVE path** on Vercel Cron. The 10-minute GitHub pipeline stays the baseline
(full fixtures, standings, lineups, off-match data) — it is not changed or removed. The minute path only touches live
matches and reuses the existing ingest write-order and the existing alert dispatcher.

- Engineering call: the minute path lives inside the Next app as a cron route, not a second GitHub job, so it can
  write to the DB and push alerts in the same request with the service-role client the app already has.

### Route `POST|GET /api/live/tick`

`dynamic = 'force-dynamic'`, `maxDuration = 60`. Vercel Cron issues a GET and auto-sends
`Authorization: Bearer $CRON_SECRET`; the route accepts `CRON_SECRET` **or** `ALERTS_SECRET` (constant-time compare,
reusing `bearerOk`). No secret configured at all, or a bad token → 401.

**Safe dormant state.** With `API_FOOTBALL_KEY` unset the route returns `200 {skipped:"no key"}` and does nothing, so
the branch is safe to deploy before the owner buys the API plan and sets the key. Same for a missing DB client.

**Live gate (cost control).** The route first reads this league/season's fixtures from the `fixtures` table (already
filled by the 10-minute pipeline) and computes "in a match window" with the **same rule as `update.mjs`**: a fixture
is `LIVE` (status in `1H,HT,2H,ET,BT,P,SUSP,INT,LIVE`) **or** kickoff is within `[-150min, +30min]` of now. If none →
`200 {skipped:"no live match"}` and **zero API-Football calls**.

**While live.** One `GET /fixtures?league=<LEAGUE>&season=<SEASON>&live=all` (header `x-apisports-key`), filtered to
this league, then one `GET /fixtures/events?fixture=<id>` per live fixture. So the per-minute cost is
`1 + (number of live fixtures)` calls — normally 2 (one match). Events are mapped into the FixtureDetail `.ev` shape
the ingest and `describeAlerts` already use, so the banner/scorer text keeps working unchanged.

**Write order (reuses `scripts/ingest-league.ts`).** Via the admin client, in this exact order so the goal trigger
fires with the scorers already present:
1. upsert `api_teams` (merge),
2. insert new `fixtures` (ignore-duplicates — no UPDATE, no trigger; needed as the FK for details),
3. upsert `fixture_details` with **events only** (never lineups, so the 10-minute pipeline's lineups are never
   clobbered; a fixture whose events call failed is skipped, so existing events are not overwritten with `[]`),
4. upsert `fixtures` (merge: scores/status/elapsed) — this fires `fixtures_alerts`.
`is_demo` is never written. Mapping reuses `toRows` and the row types from `features/matches/ingest/rows.ts`.

**Alerts within the minute.** After the writes the route calls `dispatchAlerts()` inline, the same dispatcher the
ingest workflow POSTs to, so the queued goal / full-time pushes go to phones in the same request.

**Graceful on error.** Any API-Football failure logs the **status code only** (public logs: codes and counts only,
never the key or any secret) and returns `200` with a small `{error, status}` summary — never a 500 that would spam.
The response is counts and codes only.

### Season fallback

`SEASON` comes from env. If unset, the route computes it: API-Football's season is the calendar year a season starts
in, and Ligat Ha'Al runs ~Aug→May, so from July on it is the current year, before July the previous year
(`currentSeason()` in `features/matches/ingest/live.ts`). `LEAGUE` defaults to `383`, as in `update.mjs`.

### Cron

`apps/web/vercel.json` gains `"crons": [{ "path": "/api/live/tick", "schedule": "* * * * *" }]`. `regions` and
`ignoreCommand` are unchanged. Every-minute cron needs **Vercel Pro**.

## Env vars the owner sets in Vercel (names only)

- `API_FOOTBALL_KEY` — the API-Football key (paid plan; without it the route no-ops).
- `CRON_SECRET` — Vercel Cron sends it automatically as the bearer; set it so only the cron (and the alerts tooling)
  can drive the route.
- `SEASON` — the current season's start year (e.g. `2025`). Optional; without it the date-based fallback is used.

(`LEAGUE` is optional, defaults to 383. `ALERTS_SECRET` and the Supabase keys already exist.)

## Requirements / costs

- **Vercel Pro** for the every-minute cron.
- **API-Football paid plan**: the free plan (100 req/day) cannot sustain per-minute calls during a match. Budget:
  about `1 + live-matches` calls per minute, only while a match is in window.

## Tests

`features/matches/ingest/live.test.ts` (pure mapping: fixtures, events→`.ev`, scorers via the real `goalsSince`,
season fallback) and `app/api/live/tick/route.test.ts` (401 without a valid bearer; zero API calls with no in-window
fixture; no-op without the key; the live path's two API calls, ingest-order upserts and inline dispatch; graceful skip
on API error). `fetch` and the admin client are mocked.
