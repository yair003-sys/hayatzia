-- Performance fixes from the 50,000-fan load test (migration 20261017090000_perf_fixes, docs/load-test-2026-10-17.md
-- findings 1-4). The fixes must give exactly the same answers as before:
--   1. trips: every fan sees the same trips with the old and the new row rules, with the verification switch off and on
--      (suspended, lifted, unverified, verified, accepted rider, admin, own rows, other club, hidden by moderation);
--   2. home_player_reviews: the same rows for every fan with the old and the new body (blocks either way, a block
--      between two other fans, likes);
--   3. the player_ratings (user_id) index exists;
--   4. the crowd verdict still counts every keyword message and opens exactly one poll, also when the match's lock is
--      busy (simulated: the lock helper answers "taken");
--   review (migration 20261017093000_perf_review): a fan's crowd_tick is rate-limited and never takes the lock without
--   work; trip_requests_not_ride_suspended gives the same answers in its once-per-query form; anon has no usage on the
--   `private` schema. NOTE: `private` must never be in the API's exposed schemas (see the migration header); this
--   file cannot see the API settings, it checks the grants that are the second line of defence.
-- Method for 1 and 2: snapshot what each fan sees with the new definitions, put the old definitions back inside this
-- transaction (rolled back at the end), snapshot again and compare.
begin;
select plan(50);

-- d01 unverified driver, d02 suspended from rides, d03 suspension lifted, d04 verified driver, d05 unverified seeker,
-- d06 identity-verified seeker, d07 admin, d08 plain fan, d09 rider accepted on d01's offer, d10 rival club fan,
-- d11 a fan whose offer was hidden by moderation.
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-000000000d' || lpad(g::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
         'd' || g || '@test.local'
  from generate_series(1, 11) g;
insert into public.profiles (user_id, nick, team_id, created_at, birth_date, gender)
  select ('00000000-0000-0000-0000-000000000d' || lpad(g::text, 2, '0'))::uuid, 'נוסע' || g,
         case when g = 10 then 'hta' else 'mta' end, now() - interval '30 days', '1990-01-01', 'm'
  from generate_series(1, 11) g;

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-000000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '', true)
$$;
create function pg_temp.switch(p_on boolean) returns void language sql as $$
  update private.app_settings set value = to_jsonb(p_on) where key = 'rides_require_verification'
$$;

insert into public.app_admins (user_id) values (pg_temp.uid('d07'));
insert into public.ride_suspensions (user_id, reason) values (pg_temp.uid('d02'), 'בדיקה');
insert into public.ride_suspensions (user_id, reason, lifted_at) values (pg_temp.uid('d03'), 'בדיקה', now());
insert into public.fan_verifications (user_id, kind, status, provider, provider_ref, approved_at, expires_at) values
  (pg_temp.uid('d04'), 'identity', 'approved', 'mock', 'perf-d04-i', now(), now() + interval '2 years'),
  (pg_temp.uid('d04'), 'licence', 'approved', 'mock', 'perf-d04-l', now(), now() + interval '2 years'),
  (pg_temp.uid('d06'), 'identity', 'approved', 'mock', 'perf-d06-i', now(), now() + interval '2 years');
insert into public.fan_cars (user_id, plate, make, model, colour, year) values (pg_temp.uid('d04'), '1234567', 'מאזדה', '3', 'לבן', 2019);
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv')
  on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (97, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4486),
  (98, 383, 2026, 'R1', now() - interval '50 minutes', '2H', 604, 4486),
  (99, 383, 2026, 'R2', now() - interval '50 minutes', '2H', 604, 4486);

-- Written as the database owner (no signed-in fan), so the ride gates do not apply: every kind of poster exists.
insert into public.trips (user_id, fixture_id, kind, from_city, pickup, seats) values
  (pg_temp.uid('d01'), 97, 'offer', 'חיפה', 'תחנה', 2),
  (pg_temp.uid('d01'), 97, 'meet', 'חיפה', 'תחנה', 0),
  (pg_temp.uid('d02'), 97, 'offer', 'נתניה', 'צומת', 2),
  (pg_temp.uid('d02'), 97, 'meet', 'נתניה', 'צומת', 0),
  (pg_temp.uid('d03'), 97, 'offer', 'חדרה', 'תחנה', 2),
  (pg_temp.uid('d04'), 97, 'offer', 'רעננה', 'תחנה', 3),
  (pg_temp.uid('d05'), 97, 'seek', 'הרצליה', 'תחנה', 0),
  (pg_temp.uid('d06'), 97, 'seek', 'רמלה', 'תחנה', 0),
  (pg_temp.uid('d10'), 97, 'offer', 'יפו', 'תחנה', 2),
  (pg_temp.uid('d11'), 97, 'offer', 'לוד', 'תחנה', 2);
update public.trips set hidden_at = now() where user_id = pg_temp.uid('d11');
insert into public.trip_requests (trip_id, user_id, status)
  select id, pg_temp.uid('d09'), 'pending' from public.trips where user_id = pg_temp.uid('d01') and kind = 'offer';
select pg_temp.as_fan('d01');  -- only the driver accepts (trip_requests_guard)
update public.trip_requests set status = 'accepted' where user_id = pg_temp.uid('d09');
select pg_temp.as_owner();
-- Pending requests for the trip_requests rule: d04 asks d01, d02 and d05 ask d04.
insert into public.trip_requests (trip_id, user_id)
  select id, pg_temp.uid('d04') from public.trips where user_id = pg_temp.uid('d01') and kind = 'offer';
insert into public.trip_requests (trip_id, user_id)
  select t.id, u from public.trips t cross join unnest(array[pg_temp.uid('d02'), pg_temp.uid('d05')]) u
  where t.user_id = pg_temp.uid('d04') and t.kind = 'offer';

-- What one fan sees: 'poster/kind' of every visible trip, in a fixed order.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(right(t.user_id::text, 3) || '/' || t.kind, ' ' order by t.user_id, t.kind), '-')
  from public.trips t
$$;
create temp table snap (tag text, fan text, seen text);
grant all on snap to authenticated;
create function pg_temp.snapshot(p_tag text) returns void language plpgsql as $$
declare
  f text;
begin
  foreach f in array array['d01','d02','d03','d04','d05','d06','d07','d08','d09','d10','d11'] loop
    perform pg_temp.as_fan(f);
    execute 'set local role authenticated';
    insert into snap values (p_tag, f, pg_temp.seen());
    execute 'reset role';
  end loop;
  perform pg_temp.as_owner();
end $$;
create function pg_temp.snap_of(p_tag text) returns text language sql as $$
  select string_agg(fan || '=' || seen, ' | ' order by fan) from snap where tag = p_tag
$$;
create function pg_temp.seen_by(p_tag text, p_fan text) returns text language sql as $$
  select seen from snap where tag = p_tag and fan = p_fan
$$;

-- ---------- 1. trips: new rules, switch off then on ----------
select is((select value from private.app_settings where key = 'rides_require_verification'), 'false'::jsonb, 'the switch starts off');
select pg_temp.snapshot('new_off');
select pg_temp.switch(true);
select pg_temp.snapshot('new_on');
select pg_temp.switch(false);

-- The snapshots cover every case (so the comparison below means something).
select is(pg_temp.seen_by('new_off', 'd08'), 'd01/meet d01/offer d03/offer d04/offer d05/seek d06/seek',
  'switch off: a fan sees every ride of the club except the suspended fan''s and the hidden one');
select is(pg_temp.seen_by('new_on', 'd08'), 'd01/meet d04/offer d06/seek',
  'switch on: only verified posters'' offers and seeks, meet-ups always');
select is(pg_temp.seen_by('new_on', 'd09'), 'd01/meet d01/offer d04/offer d06/seek',
  'switch on: the accepted rider still sees the unverified driver''s ride');
select is(pg_temp.seen_by('new_on', 'd02'), 'd01/meet d02/meet d02/offer d04/offer d06/seek',
  'the suspended fan still sees their own rides');
select is(pg_temp.seen_by('new_on', 'd07'), 'd01/meet d01/offer d02/meet d02/offer d03/offer d04/offer d05/seek d06/seek d11/offer',
  'the admin sees every ride of the club, suspended, unverified and hidden');
select is(pg_temp.seen_by('new_off', 'd11'), 'd01/meet d01/offer d03/offer d04/offer d05/seek d06/seek d11/offer',
  'the fan whose ride was hidden still sees it');
select is(pg_temp.seen_by('new_off', 'd10'), 'd10/offer', 'a rival club''s fan sees only their club''s rides');

-- The plan reads the suspensions once (an InitPlan), not per row.
create function pg_temp.plan_text() returns text language plpgsql as $$
declare
  r record;
  s text := '';
begin
  perform pg_temp.as_fan('d08');
  execute 'set local role authenticated';
  for r in execute 'explain (verbose, costs off) select count(*) from public.trips where fixture_id = 97' loop
    s := s || r."QUERY PLAN" || E'\n';
  end loop;
  execute 'reset role';
  perform pg_temp.as_owner();
  return s;
end $$;
select ok(position('ride_suspended(' in pg_temp.plan_text()) = 0, 'the trip count no longer calls ride_suspended for every row');
select ok(position('active_ride_suspensions()' in pg_temp.plan_text()) > 0, 'the active suspensions are read once per query');

-- Now the old rules (as they were before this migration), inside this transaction only.
alter policy trips_not_ride_suspended on public.trips
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or not private.ride_suspended(user_id));
alter policy trips_verified_or_hidden on public.trips
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or private.ride_poster_ok(user_id, kind)
         or private.accepted_on(id));
select pg_temp.snapshot('old_off');
select pg_temp.switch(true);
select pg_temp.snapshot('old_on');
select pg_temp.switch(false);

select is(pg_temp.snap_of('new_off'), pg_temp.snap_of('old_off'), 'switch off: every fan sees exactly the same rides as before');
select is(pg_temp.snap_of('new_on'), pg_temp.snap_of('old_on'), 'switch on: every fan sees exactly the same rides as before');

-- A suspension that starts or is lifted later is seen at once (nothing is cached between queries).
insert into public.ride_suspensions (user_id, reason) values (pg_temp.uid('d04'), 'בדיקה');
update public.ride_suspensions set lifted_at = now() where user_id = pg_temp.uid('d02');
select pg_temp.as_fan('d08');
set local role authenticated;
select is(pg_temp.seen(), 'd01/meet d01/offer d02/meet d02/offer d03/offer d05/seek d06/seek',
  'old rules: a new suspension hides the driver at once, a lifted one shows the rides again');
reset role;
-- (back to the new rules for the same check)
select pg_temp.as_owner();
alter policy trips_not_ride_suspended on public.trips
  using (user_id = (select auth.uid()) or (select public.is_app_admin())
         or user_id <> all (coalesce((select private.active_ride_suspensions()), '{}')));
alter policy trips_verified_or_hidden on public.trips
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or not (select private.ride_verification_on())
         or private.ride_poster_ok(user_id, kind) or private.accepted_on(id));
select pg_temp.as_fan('d08');
set local role authenticated;
select is(pg_temp.seen(), 'd01/meet d01/offer d02/meet d02/offer d03/offer d05/seek d06/seek',
  'new rules: the same answer right after the suspensions changed');
reset role;
select pg_temp.as_owner();

-- ---------- trip_requests rule (review): same answers once per query ----------
-- Now d04 is suspended and d02's suspension is lifted (above).
create function pg_temp.requests_seen() returns text language sql as $$
  select coalesce(string_agg(right(q.user_id::text, 3), ' ' order by q.user_id, q.trip_id), '-') from public.trip_requests q
$$;
create function pg_temp.request_snapshot(p_tag text) returns void language plpgsql as $$
declare
  f text;
begin
  foreach f in array array['d01','d02','d03','d04','d05','d06','d07','d08','d09','d10','d11'] loop
    perform pg_temp.as_fan(f);
    execute 'set local role authenticated';
    insert into snap values (p_tag, f, pg_temp.requests_seen());
    execute 'reset role';
  end loop;
  perform pg_temp.as_owner();
end $$;
select pg_temp.request_snapshot('req_new');
select is(pg_temp.seen_by('req_new', 'd01'), 'd09', 'the driver does not see the request of a fan suspended from rides');
select is(pg_temp.seen_by('req_new', 'd04'), 'd02 d04 d05', 'the suspended fan still sees their own request and the ones on their ride');
select is(pg_temp.seen_by('req_new', 'd05'), 'd05', 'a rider sees their own request');
alter policy trip_requests_not_ride_suspended on public.trip_requests
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or not private.ride_suspended(user_id));
select pg_temp.request_snapshot('req_old');
select is(pg_temp.snap_of('req_new'), pg_temp.snap_of('req_old'), 'trip_requests: every fan sees exactly the same requests as before');
alter policy trip_requests_not_ride_suspended on public.trip_requests
  using (user_id = (select auth.uid()) or (select public.is_app_admin())
         or user_id <> all (coalesce((select private.active_ride_suspensions()), '{}')));

-- ---------- helpers: privileges and search_path ----------
select ok(not has_function_privilege('anon', 'private.active_ride_suspensions()', 'execute'), 'anon cannot read the suspension list');
select ok(not has_function_privilege('anon', 'private.ride_verification_on()', 'execute'), 'anon cannot run the switch helper');
select ok(not has_function_privilege('anon', 'private.my_blocked_ids()', 'execute'), 'anon cannot run the blocked-fans helper');
select ok(not has_function_privilege('authenticated', 'private.crowd_try_lock(bigint)', 'execute'), 'fans cannot take the crowd lock');
select ok(not has_function_privilege('anon', 'private.crowd_try_lock(bigint)', 'execute'), 'anon cannot take the crowd lock');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on the private schema (second line behind not exposing it)');
select ok(not has_function_privilege('authenticated', 'private.crowd_tick_work(bigint)', 'execute'), 'fans cannot run the tick work directly');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('active_ride_suspensions', 'ride_verification_on', 'my_blocked_ids', 'crowd_try_lock')
              and p.prosecdef and p.proconfig @> array['search_path=""']), 4,
  'the four new helpers are security definer with an empty search_path');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'private' and p.proname = 'my_blocked_ids' and p.pronargs > 0),
  'the blocked-fans helper takes no fan id (it answers only about the caller)');

-- ---------- 2. home_player_reviews ----------
-- r1 viewer, r2 blocked by r1, r3 blocked r1, r4 blocked by r5 (a block between two other fans), r5, r6 plain author.
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-0000000000' || x)::uuid, 'authenticated', 'authenticated', x || '@test.local'
  from unnest(array['c1','c2','c3','c4','c5','c6']) x;
insert into public.profiles (user_id, nick, team_id)
  select ('00000000-0000-0000-0000-0000000000' || x)::uuid, 'מדרג' || x, 'mta' from unnest(array['c1','c2','c3','c4','c5','c6']) x;
insert into public.player_ratings (player_id, user_id, stars, review)
  select p, ('00000000-0000-0000-0000-0000000000' || x)::uuid, 4, 'ביקורת ' || x
  from unnest(array['c1','c2','c3','c4','c5','c6']) x cross join unnest(array['mta_1', 'mta_14']) p;
insert into public.blocks (user_id, blocked_id) values
  (pg_temp.uid('0c1'), pg_temp.uid('0c2')), (pg_temp.uid('0c3'), pg_temp.uid('0c1')), (pg_temp.uid('0c5'), pg_temp.uid('0c4'));
insert into public.player_rating_likes (player_id, author_id, user_id) values
  ('mta_1', pg_temp.uid('0c6'), pg_temp.uid('0c1')), ('mta_1', pg_temp.uid('0c6'), pg_temp.uid('0c5')),
  ('mta_1', pg_temp.uid('0c4'), pg_temp.uid('0c1'));

create function pg_temp.reviews() returns text language sql as $$
  select coalesce(string_agg(r.player_id || ':' || right(r.author_id::text, 2) || ':' || r.likes_count || ':' || r.liked,
                             ' ' order by r.player_id, r.likes_count desc, r.updated_at desc, r.author_id), '-')
  from public.home_player_reviews(5) r
$$;
create function pg_temp.review_snapshot(p_tag text) returns void language plpgsql as $$
declare
  f text;
begin
  foreach f in array array['0c1','0c2','0c3','0c4','0c5','0c6','d10'] loop
    perform pg_temp.as_fan(f);
    execute 'set local role authenticated';
    insert into snap values (p_tag, f, pg_temp.reviews());
    execute 'reset role';
  end loop;
  perform pg_temp.as_owner();
end $$;
select pg_temp.review_snapshot('rev_new');

select is(pg_temp.seen_by('rev_new', '0c1'), 'mta_1:c6:2:true mta_1:c4:1:true mta_1:c1:0:false mta_1:c5:0:false mta_14:c1:0:false mta_14:c4:0:false mta_14:c5:0:false mta_14:c6:0:false',
  'the viewer does not see a fan they blocked nor a fan who blocked them; a block between two others does not matter');
select ok(position(':c4:' in pg_temp.seen_by('rev_new', '0c5')) = 0, 'the fan who blocked c4 does not see c4''s reviews');
select ok(position(':c1:' in pg_temp.seen_by('rev_new', '0c3')) = 0 and position(':c1:' in pg_temp.seen_by('rev_new', '0c2')) = 0,
  'both sides of a block are hidden from each other');
select is(pg_temp.seen_by('rev_new', 'd10'), '-', 'a rival club''s fan sees none of these reviews');

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
         and not public.blocked_between((select auth.uid()), x.user_id)
       order by x.likes_count desc, x.updated_at desc, x.user_id
       limit least(greatest(coalesce(p_per_player, 5), 1), 20)
    ) t
   where pl.team_id = (select public.my_team())
   order by t.player_id, t.likes_count desc, t.updated_at desc, t.user_id
$$;
select pg_temp.review_snapshot('rev_old');
select is(pg_temp.snap_of('rev_new'), pg_temp.snap_of('rev_old'), 'home_player_reviews: every fan gets exactly the same rows as before');

-- ---------- 3. index ----------
select has_index('public', 'player_ratings', 'player_ratings_user_idx', array['user_id'], '"my ratings" has an index on user_id');

-- ---------- 4. crowd verdict with a free and a busy lock ----------
create function pg_temp.fan(i int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid
$$;
insert into auth.users (id, aud, role, email)
  select pg_temp.fan(i), 'authenticated', 'authenticated', 'k' || i || '@test.local' from generate_series(1, 40) i;
insert into public.profiles (user_id, nick, team_id)
  select pg_temp.fan(i), 'צועק' || i, case when i % 2 = 0 then 'mta' else 'hta' end from generate_series(1, 40) i;
create function pg_temp.polls(p_kind text) returns int language sql as $$
  select count(*)::int from public.match_polls where fixture_id = 98 and kind = p_kind
$$;
create function pg_temp.burst(p_kind text) returns int language sql as $$
  select count(*)::int from public.match_chat_bursts where fixture_id = 98 and kind = p_kind
$$;

select ok(private.crowd_try_lock(98), 'the lock helper takes the free lock');
select ok(private.crowd_try_lock(98), 'and takes it again in the same transaction (it is re-entrant)');

-- Lock free: the 15th distinct fan opens exactly one poll, the 16th does not open another.
insert into public.match_messages (fixture_id, user_id, body) select 98, pg_temp.fan(i), 'פנדל!!' from generate_series(1, 14) i;
select is(pg_temp.polls('penalty'), 0, 'lock free: 14 fans are not a burst');
insert into public.match_messages (fixture_id, user_id, body) values (98, pg_temp.fan(15), 'פנדל');
select is(pg_temp.polls('penalty'), 1, 'lock free: the 15th fan opens the poll');
insert into public.match_messages (fixture_id, user_id, body) values (98, pg_temp.fan(16), 'פנדל');
select is(pg_temp.polls('penalty'), 1, 'lock free: the 16th fan does not open a second poll');

-- Lock busy (another writer of this match holds it): simulated by a helper that says "taken".
create or replace function private.crowd_try_lock(p_fixture bigint) returns boolean
language sql volatile security definer set search_path = '' as $$ select false $$;
select lives_ok($$ insert into public.match_messages (fixture_id, user_id, body)
                   select 98, pg_temp.fan(i), 'נבדל!' from generate_series(17, 31) i $$,
  'lock busy: the messages are written without waiting');
select is(pg_temp.burst('offside'), 15, 'lock busy: every keyword message is still counted (15 distinct fans)');
select is(pg_temp.polls('offside'), 0, 'lock busy: the poll is not opened by a message that finds the lock taken (the trade-off)');
-- Lock free again: the next keyword message of the burst opens the poll, once.
create or replace function private.crowd_try_lock(p_fixture bigint) returns boolean
language sql volatile security definer set search_path = '' as $$ select pg_try_advisory_xact_lock(hashtext('crowd:' || p_fixture)) $$;
update public.match_polls set opens_at = now() - interval '2 minutes', closes_at = now() - interval '1 second' where fixture_id = 98;
-- Written in the fan's session (claims set): the trigger's tick is not rate-limited like a fan's own RPC call.
select pg_temp.as_fan('232');
insert into public.match_messages (fixture_id, user_id, body) values (98, pg_temp.fan(32), 'נבדל');
select pg_temp.as_owner();
select is(pg_temp.polls('offside'), 1, 'the next keyword message (lock free) opens the poll, counting all 16 fans');
select is(pg_temp.burst('offside'), 0, 'opening the poll clears the burst');
insert into public.match_messages (fixture_id, user_id, body) values (98, pg_temp.fan(33), 'נבדל');
select is(pg_temp.polls('offside'), 1, 'and a later message does not open a second one');

-- ---------- a fan's crowd_tick (review) ----------
-- The match's crowd lock held by this session?
create function pg_temp.crowd_lock_held(p_fixture bigint) returns boolean language sql as $$
  select exists (select 1 from pg_locks l where l.locktype = 'advisory' and l.pid = pg_backend_pid()
                  and l.objid::bigint = (hashtext('crowd:' || p_fixture)::bigint & 4294967295))
$$;
create function pg_temp.fan_tick(p_fixture bigint) returns void language plpgsql as $$
begin
  perform pg_temp.as_fan('d08');
  execute 'set local role authenticated';
  perform public.crowd_tick(p_fixture);
  execute 'reset role';
  perform pg_temp.as_owner();
end $$;
select lives_ok($$ select pg_temp.fan_tick(99) $$, 'a fan may tick a match with nothing to do');
select ok(not pg_temp.crowd_lock_held(99), 'with nothing to do, a fan''s tick does not take the match''s lock (a looping fan cannot hold it)');
select is((select count(*)::int from private.crowd_tick_calls where user_id = pg_temp.uid('d08') and fixture_id = 99), 1,
  'the fan''s call is recorded for the rate limit');
insert into public.match_polls (fixture_id, kind, question, options, source, opens_at, closes_at)
  values (99, 'card', 'הכרטיס מוצדק?', '[{"id":"ok","emoji":"✅","label":"מוצדק"}]', 'event', now() - interval '2 minutes', now() - interval '1 second');
select pg_temp.fan_tick(99);
select is((select summary from public.match_polls where fixture_id = 99), null,
  'a second call within 2 seconds does nothing (rate limit per fan and match)');
update private.crowd_tick_calls set at = now() - interval '3 seconds' where user_id = pg_temp.uid('d08') and fixture_id = 99;
select pg_temp.fan_tick(99);
select is((select summary from public.match_polls where fixture_id = 99), 'אף אחד לא הצביע', 'after 2 seconds the fan''s tick closes the expired poll');
select ok(pg_temp.crowd_lock_held(99), 'with work to do it took the lock (and did the work once)');

select * from finish();
rollback;
