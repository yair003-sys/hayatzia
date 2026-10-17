-- Perf round 2 (docs/perf-round-2.md): the server reads the club's rating totals once per club with the service role
-- and caches them for every fan of the club (features/ratings/server/queries.ts, getClubRatingStats). The hosted
-- projects do not grant new tables to service_role implicitly (see 20261012042000_demo_access), and
-- player_rating_stats never got that grant. Grants only; no data, no policy changes. Until this runs in a project the
-- app falls back to the fan's own session read there (a permission error is never shown to the fan).
grant select on public.player_rating_stats to service_role;
