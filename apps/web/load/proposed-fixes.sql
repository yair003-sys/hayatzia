-- LOAD TEST EXPERIMENT ONLY (not a migration, never applied to staging or production by this file): the two fixes
-- proposed in docs/load-test-2026-10-17.md, applied to the throwaway local database of web-load-local.yml when the
-- run is started with FIXES=1, so the same load can be measured with and without them. Same answers as today
-- (checked in load/explain.sql: same row counts and checksum), only evaluated once per query instead of once per row.
\set ON_ERROR_STOP on
begin;

-- 1. Trips: the restrictive select policies called two security-definer functions for every trip row
--    (ride_suspended(user_id), ride_poster_ok(user_id, kind)). The home page counts the trips of the next match on
--    every view, so the cost grew with trips × fans. Now: the active suspensions are read once per query, and the
--    verification check is skipped in one step while the switch is off (it is off: rides_require_verification).
create or replace function private.active_ride_suspensions() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(s.user_id), '{}') from public.ride_suspensions s where s.lifted_at is null
$$;
revoke all on function private.active_ride_suspensions() from public;
grant execute on function private.active_ride_suspensions() to authenticated;
create or replace function private.ride_verification_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.setting_on('rides_require_verification')
$$;
revoke all on function private.ride_verification_on() from public;
grant execute on function private.ride_verification_on() to authenticated;
alter policy trips_not_ride_suspended on public.trips
  using ((user_id = (select auth.uid())) or (select public.is_app_admin())
         or user_id <> all (coalesce((select private.active_ride_suspensions()), '{}')));
alter policy trips_verified_or_hidden on public.trips
  using ((user_id = (select auth.uid())) or (select public.is_app_admin())
         or not (select private.ride_verification_on())
         or private.ride_poster_ok(user_id, kind) or private.accepted_on(id));

-- 2. home_player_reviews: blocked_between() ran for every candidate review; the fans blocked either way are now read
--    once per call (one definer helper), the rest of the function is unchanged.
create or replace function private.blocked_ids(p_me uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(x), '{}') from (
    select b.blocked_id as x from public.blocks b where b.user_id = p_me
    union select b.user_id from public.blocks b where b.blocked_id = p_me) z
$$;
revoke all on function private.blocked_ids(uuid) from public;
grant execute on function private.blocked_ids(uuid) to authenticated;
create or replace function public.home_player_reviews(p_per_player integer default 5)
 returns table(player_id text, author_id uuid, nick text, review text, stars smallint, likes_count integer, liked boolean, updated_at timestamptz)
 language sql stable set search_path = '' as $$
  select t.player_id, t.user_id, t.nick::text, t.review::text, t.stars, t.likes_count,
         exists (select 1 from public.player_rating_likes l
                  where l.player_id = t.player_id and l.author_id = t.user_id and l.user_id = (select auth.uid())),
         t.updated_at
    from public.players pl
    cross join lateral (
      select x.player_id, x.user_id, x.nick, x.review, x.stars, x.likes_count, x.updated_at
        from public.player_ratings x
       where x.player_id = pl.id and x.review <> '' and x.updated_at > now() - interval '30 days'
         and x.user_id <> all (coalesce((select private.blocked_ids((select auth.uid()))), '{}'))
       order by x.likes_count desc, x.updated_at desc, x.user_id
       limit least(greatest(coalesce(p_per_player, 5), 1), 20)
    ) t
   where pl.team_id = (select public.my_team())
   order by t.player_id, t.likes_count desc, t.updated_at desc, t.user_id
$$;

commit;
select 'proposed fixes applied to the local load-test database' as status;
