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

-- 3. "My ratings" (getSquadWithRatings: player_ratings where user_id = me) had no index on user_id (it is the second
--    column of the primary key), so every call walked the whole primary key.
create index if not exists player_ratings_user_idx on public.player_ratings (user_id);

-- 4. Crowd verdict during a burst: once 15 fans wrote a keyword within 60 s, every further keyword message called
--    crowd_tick(), which waits for the match's advisory lock until the other writer commits, so a goal moment's
--    messages queued one behind the other. The chat trigger now only ticks when the lock is free right away
--    (pg_try_advisory_xact_lock); a message that finds it taken skips the tick, the next message or the app's own
--    crowd_tick call does it. Everything else in the function is unchanged.
create or replace function public.match_messages_crowd() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text := public.crowd_keyword(new.body);
  c integer;
  t record;
begin
  if k is null then
    return null;
  end if;
  insert into public.match_chat_bursts (fixture_id, kind, user_id, at) values (new.fixture_id, k, new.user_id, now())
    on conflict (fixture_id, kind, user_id) do update set at = excluded.at;
  delete from public.match_chat_bursts where fixture_id = new.fixture_id and kind = k and at < now() - interval '2 minutes';
  select count(*) into c from public.match_chat_bursts
    where fixture_id = new.fixture_id and kind = k and at > now() - interval '60 seconds';
  if c >= 15 and pg_try_advisory_xact_lock(hashtext('crowd:' || new.fixture_id)) then
    perform public.crowd_tick(new.fixture_id);
    select * into t from public.crowd_chat_template(k);
    if public.crowd_open_poll(new.fixture_id, k, 'chat', t.question, t.options, null, null) is not null then
      delete from public.match_chat_bursts where fixture_id = new.fixture_id and kind = k;
    end if;
  end if;
  return null;
end $$;

commit;
select 'proposed fixes applied to the local load-test database' as status;
