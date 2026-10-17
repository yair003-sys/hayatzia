-- Performance fixes from the 50,000-fan load test (docs/load-test-2026-10-17.md, findings 1-4; measured in
-- apps/web/load/proposed-fixes.sql). Same answers as before, proven in tests/database/perf_fixes.test.sql by comparing
-- what every kind of fan sees with the old and the new definitions.
--
-- IMPORTANT: the `private` schema must never be in the API's exposed schemas. Its definer helpers below are granted to
-- `authenticated` only so that row rules and triggers can call them (see 20261017093000_perf_review.sql).
--
-- Engineering calls:
-- - trips row rules: the active ride suspensions are read once per query (an InitPlan), not one function call per
--   row; while the verification switch is off the verification check stops in one step. Once the switch is turned on,
--   ride_poster_ok runs per row again: before switching it on, turn it into a once-per-query set as well.
-- - home_player_reviews: the fans blocked either way are read once per call. The helper takes no fan id and answers
--   only about the caller (auth.uid()), so it cannot tell who blocked whom among other fans (security review
--   2026-10-15, blocked_between). The load test's proposal took a fan id; this is the safer form, same answer.
-- - player_ratings (user_id) index for "my ratings" and account deletion (user_id is the second primary-key column).
-- - Crowd verdict: a chat keyword message only does the poll bookkeeping (crowd_tick + open) when the match's lock is
--   free right away. Trade-off: a keyword message that finds the lock taken is still counted in the burst, but does
--   not itself open the poll; the next keyword message of the burst does (any message while 15+ distinct fans
--   shouted in the last 60 s). If the very last message of a burst is the one that finds the lock busy, the poll opens
--   only with the next keyword message (none may come). In a real goal moment many messages follow, so this is
--   accepted to stop the room's writers queueing one behind the other.

-- ---------- 1. trips ----------
create function private.active_ride_suspensions() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(s.user_id), '{}') from public.ride_suspensions s where s.lifted_at is null
$$;
revoke all on function private.active_ride_suspensions() from public, anon;
grant execute on function private.active_ride_suspensions() to authenticated, service_role;

create function private.ride_verification_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.setting_on('rides_require_verification')
$$;
revoke all on function private.ride_verification_on() from public, anon;
grant execute on function private.ride_verification_on() to authenticated, service_role;

alter policy trips_not_ride_suspended on public.trips
  using (user_id = (select auth.uid()) or (select public.is_app_admin())
         or user_id <> all (coalesce((select private.active_ride_suspensions()), '{}')));
alter policy trips_verified_or_hidden on public.trips
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or not (select private.ride_verification_on())
         or private.ride_poster_ok(user_id, kind) or private.accepted_on(id));

-- ---------- 2. home_player_reviews ----------
create function private.my_blocked_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(z.x), '{}') from (
    select b.blocked_id as x from public.blocks b where b.user_id = (select auth.uid())
    union
    select b.user_id from public.blocks b where b.blocked_id = (select auth.uid())
  ) z
$$;
revoke all on function private.my_blocked_ids() from public, anon;
grant execute on function private.my_blocked_ids() to authenticated, service_role;

create or replace function public.home_player_reviews(p_per_player integer default 5)
returns table (player_id text, author_id uuid, nick text, review text, stars smallint, likes_count integer,
               liked boolean, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select t.player_id, t.user_id, t.nick::text, t.review::text, t.stars, t.likes_count,
         exists (select 1 from public.player_rating_likes l
                  where l.player_id = t.player_id and l.author_id = t.user_id and l.user_id = (select auth.uid())),
         t.updated_at
    from public.players pl
    cross join lateral (
      select x.player_id, x.user_id, x.nick, x.review, x.stars, x.likes_count, x.updated_at
        from public.player_ratings x
       where x.player_id = pl.id and x.review <> '' and x.updated_at > now() - interval '30 days'
         and x.user_id <> all (coalesce((select private.my_blocked_ids()), '{}'))
       order by x.likes_count desc, x.updated_at desc, x.user_id
       limit least(greatest(coalesce(p_per_player, 5), 1), 20)
    ) t
   where pl.team_id = (select public.my_team())
   order by t.player_id, t.likes_count desc, t.updated_at desc, t.user_id
$$;
revoke all on function public.home_player_reviews(integer) from public, anon;
grant execute on function public.home_player_reviews(integer) to authenticated;

-- ---------- 3. index ----------
create index player_ratings_user_idx on public.player_ratings (user_id);

-- ---------- 4. crowd verdict during a burst ----------
-- The match's crowd lock, if it is free right now (re-entrant inside one transaction). Only the database's own
-- triggers call it.
create function private.crowd_try_lock(p_fixture bigint) returns boolean
language sql volatile security definer set search_path = '' as $$
  select pg_try_advisory_xact_lock(hashtext('crowd:' || p_fixture))
$$;
revoke all on function private.crowd_try_lock(bigint) from public, anon, authenticated;

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
  if c >= 15 and private.crowd_try_lock(new.fixture_id) then
    perform public.crowd_tick(new.fixture_id);
    select * into t from public.crowd_chat_template(k);
    if public.crowd_open_poll(new.fixture_id, k, 'chat', t.question, t.options, null, null) is not null then
      delete from public.match_chat_bursts where fixture_id = new.fixture_id and kind = k;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.match_messages_crowd() from public, anon, authenticated;
