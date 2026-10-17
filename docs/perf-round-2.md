# Performance round 2 (2026-10-17, branch `perf-2`)

Goal: fewer PostgREST requests per page view (the 50k load test's bottleneck was the pool queue, `load-test-2026-10-17.md`)
and less client JS, with identical behaviour. Rule for every shared cache: it holds only what **every** fan of the club
(or everyone) reads under RLS; the per-fan part (my ratings, my lineup, my scores, my likes, blocks) is read per request
and merged after. Failures throw inside the cached function (never cached) and callers keep their null / "could not
load" behaviour.

## What is cached

| Data | Function | Client | Life (`cacheLife`) | Tags | Refreshed by | Used by |
|---|---|---|---|---|---|---|
| Club squad (`players`, RLS `using (true)`, reference data) | `getClubPlayers` (`features/teams/server/queries.ts`) | public (anon) | `'hours'` | `players`, `players:<club>` | time only (written by migrations / seed) | home cards, home pitch, `/stand/players`, fan lineup, player of the match |
| Club rating totals (`player_rating_stats`, RLS: own club's players) | `getClubRatingStats` (`features/ratings/server/queries.ts`) | service role, filtered to the club | stale/revalidate 30 s, expire 120 s | `rating-stats:<club>` | `ratePlayerAction` (`updateTag`) | home cards, home pitch, `/stand/players` |
| Fans' lineup totals + winning formation's tallies (`fan_lineup_totals` / `_tallies`, RLS `using (true)`) | `getLineupAggregates` (`features/lineup/server/queries.ts`) | service role | 30 s / 120 s | `fan-lineup:<match>`, `fan-lineup:<match>:<club>` | `saveFanLineupAction` | match page, הרכב |
| Match rating totals (`match_rating_stats`, RLS: own club's players) | `getMatchRatingStats` (`features/stage4/server/queries.ts`) | service role, filtered to the club | 30 s / 120 s | `match-ratings:<match>`, `match-ratings:<match>:<club>` | `rateMatchAction` | match page (player of the match, fans' ratings) |

The club id is always the signed-in fan's own club from `getSessionProfile()` (the caller has proven membership).
Without a service key (CI, local) and on a permission error (`42501`, until migration `20261017120000_perf_round2`
grants `select on player_rating_stats to service_role` in that project) the service-role reads fall back to the fan's
own session read, exactly as before. `supabase/tests/database/perf_round2.test.sql` checks the premise: the service role
may read each cached table, and its club-filtered read equals what each fan of the club reads (a fan, the author of a
hidden rating, another club's fan).

Already cached before this round: league / fixtures (`league`, `fixture-<id>`), club API ids, active fans,
fans of the week.

## Other changes
- `getUnreadCount` is deduplicated per request (`react` `cache`): the home's own bell and the layout's floating bell
  made two RPCs per home view.
- Waterfalls: `/stand` (`StandHome`) starts the four counts and the squad together with the league read; only the trips
  count and the check-in wait for the next match. `/stand/trips` reads the fan's ride profile, rides to rate and
  verification together with the league; only the trips wait for the matches.
- `/inbox/qr`: the `qrcode` encoder is imported inside the effect that draws the code.
- CI: `scripts/bundle-report.sh` after the build posts a notice with the largest client chunks (raw / gzip, which
  libraries they hold) and the chunks of the busiest pages.

Requests saved per page view (warm cache, fan with a club): home 4 (squad with embedded totals, squad,
rating totals, one bell RPC); `/stand/players` 2 of 3; match page for a fan of the two clubs up to 6 (squad ×2,
lineup totals, tallies, match totals ×2 after the match).

## Deliberately not cached (and why)
- **Team chat first page, chat preview, match room, Square feed, stories, hot posts, trips, events, market, chants
  counts.** Not identical for every fan of the club under RLS: a moderated (hidden) row stays visible to its author
  and to admins; view-once posts disappear per viewer (`clip_seen`); trips of a suspended or unverified poster stay
  visible to the poster. A shared copy would either hide a fan's own hidden row (revealing the moderation) or show it to
  others. Filtering these per request needs a per-fan read anyway, so there is nothing to save. The chat is live through
  Realtime as well.
- **`home_player_reviews`.** Per fan inside the SQL: my ♥, blocks either way before the top-N cut, my own hidden review.
  Already 15 ms after round 1.
- **Crowd-war totals.** Readable by any fan, but live (every message scores) and shown next to the fan's own uncached
  share; a stale total could be smaller than "your share". One primary-key read.
- **Private messages, inbox, activity, bell count, profile, blocks, prefs.** Personal; never in a shared cache (DMs are
  end-to-end encrypted and never pass the server in plaintext).
- **Signed media URLs.** Signed with the fan's session per request.

## Client JS (measured by the bundle report, CI)
Baseline (before this round): all client chunks 1,627 KB raw / 518 KB gzip; largest: supabase-js realtime + auth
256 KB / 67 KB, react-dom 224 / 70, Next runtime 129 / 35, a 110 / 38 chunk, **zod 110 / 31** (the "emoji data" is
zod's own emoji regex), a 40 / 14 chunk with the photo-shrinking canvas code (Square upload). Page chunks of `/stand`
536 / 156 KB.

Not changed, on purpose (needs work that CI cannot verify):
- **supabase-js on every page** is required: the app layout mounts `OnlineTracker` (presence on `online:<club>`), the
  bell and the in-app banner, all on Realtime. Loading it after hydration (`import()` in each effect) touches 22 call
  sites including the realtime and E2EE paths; CI runs without Supabase, so none of it would be exercised. Better first
  step: the presence change proposed in the load test (finding 5).
- **zod on every page**: `lib/env.ts` (t3-env, via `lib/supabase/config.ts`) is reached from the browser client, the
  in-app banner validates realtime payloads with zod, and most `features/*/schema.ts` mix zod schemas with pure helpers
  that client components import. Removing it means splitting those files (pure helpers vs zod validators) and
  replacing the client-side payload checks; a refactor of its own.
- `qrcode` was already only in `/inbox/qr`; it is now loaded on demand there.
