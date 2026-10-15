-- Crowd war ("מלחמת הקהלים"): points per fan per match from the 48 hours before kick-off, with caps, only for fans of
-- the two clubs, club totals by trigger, own fan row only, totals for signed-in fans, the season record.
begin;
select plan(45);

-- h1, h2: Maccabi Haifa. b1: Beitar. m1: Maccabi Tel Aviv. s1: Hapoel Beer Sheva (no match in the window).
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-000000000' || x)::uuid, 'authenticated', 'authenticated', x || '@test.local'
  from unnest(array['c01', 'c02', 'c03', 'c04', 'c05']) x;
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-000000000c01', 'חיפאי', 'mhf'),
  ('00000000-0000-0000-0000-000000000c02', 'ירוק', 'mhf'),
  ('00000000-0000-0000-0000-000000000c03', 'בייתרי', 'bei'),
  ('00000000-0000-0000-0000-000000000c04', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-000000000c05', 'באר שבעי', 'hbs');

create function pg_temp.uid(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || p)::uuid $$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true)
$$;
-- n team chat messages, aged past the chat's rate limit (5 per 10 seconds) after each one.
create function pg_temp.chat(p text, n integer) returns void language plpgsql as $$
begin
  for i in 1..n loop
    insert into public.team_messages (user_id, team_id, body) values (pg_temp.uid(p), 'mta', 'יאללה ' || i);
    update public.team_messages set created_at = created_at - interval '1 minute' where user_id = pg_temp.uid(p);
  end loop;
end $$;
create function pg_temp.post(p text, n integer) returns void language plpgsql as $$
begin
  for i in 1..n loop
    insert into public.clips (user_id, team_id, media_path, kind)
      values (pg_temp.uid(p), 'mta', pg_temp.uid(p) || '/cw' || i || '-' || gen_random_uuid() || '.jpg', 'image');
  end loop;
end $$;
create function pg_temp.pts(p_fixture bigint, p text) returns integer language sql as $$
  select coalesce((select points::int from public.crowd_war_fans where fixture_id = p_fixture and user_id = pg_temp.uid(p)), 0)
$$;
create function pg_temp.xi(p text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('slot', i - 1, 'player_id', x) order by i) from unnest(p) with ordinality u(x, i)
$$;

insert into public.api_teams (api_id, name) values
  (650, 'Maccabi Haifa'), (651, 'Beitar Jerusalem'), (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv')
  on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id, is_demo) values
  (201, 383, 2026, 'R1', now() + interval '10 hours', 'NS', 650, 651, false),     -- the war: inside the window
  (202, 383, 2026, 'R2', now() + interval '3 days', 'NS', 651, 650, false),       -- window not open yet
  (203, 383, 2026, 'R1', now() + interval '20 minutes', 'NS', 604, 4486, true),   -- demo match, room open, in window
  (204, 383, 2026, 'R1', now() - interval '10 minutes', 'NS', 4486, 604, false);  -- kicked off (room still open)

-- ── schema and privileges ──
select has_table('public', 'crowd_war_fans', 'fan rows table exists');
select has_table('public', 'crowd_war_totals', 'club totals table exists');
select col_is_pk('public', 'crowd_war_fans', array['fixture_id', 'user_id'], 'one row per fan per match');
select has_index('public', 'crowd_war_totals', 'crowd_war_totals_team_idx', 'totals by club (season record)');
select ok(not has_function_privilege('anon', 'public.crowd_war_record(text, integer)', 'execute'), 'anon cannot read a season record');
select ok(has_function_privilege('authenticated', 'public.crowd_war_record(text, integer)', 'execute'), 'fans read a season record');
select ok(not has_function_privilege('authenticated', 'public.crowd_war_track()', 'execute'), 'the trigger function is internal');
select ok(not has_function_privilege('authenticated', 'private.crowd_war_score(bigint, uuid, text, text)', 'execute'), 'scoring is internal');
select ok(not has_table_privilege('authenticated', 'public.crowd_war_fans', 'insert'), 'fans cannot write their points');
select ok(not has_table_privilege('authenticated', 'public.crowd_war_totals', 'update'), 'fans cannot write the totals');
set local role anon;
select throws_ok($$ select * from public.crowd_war_totals $$, '42501', null, 'anon cannot read the totals');
select throws_ok($$ select * from public.crowd_war_record('mhf', 2026) $$, '42501', null, 'anon cannot run the season record');
reset role;

-- ── chat: 1 point each, at most 20 ──
select pg_temp.chat('c01', 20);
select is(pg_temp.pts(201, 'c01'), 20, 'twenty team chat messages: 20 points, to the club''s match in the window');
select pg_temp.chat('c01', 1);
select is(pg_temp.pts(201, 'c01'), 20, 'the 21st message adds nothing');
select is((select count(*)::int from public.crowd_war_fans where fixture_id = 202), 0, 'nothing for the match whose window is not open');

-- ── Square posts: 5 each, at most 3 ──
select pg_temp.post('c01', 3);
select is(pg_temp.pts(201, 'c01'), 35, 'three posts: +15');
select pg_temp.post('c01', 1);
select is(pg_temp.pts(201, 'c01'), 35, 'the 4th post adds nothing');

-- ── prediction: 5 once ──
select pg_temp.as_fan('c01');
set local role authenticated;
insert into public.predictions (fixture_id, home_goals, away_goals) values (201, 2, 0);
select is(pg_temp.pts(201, 'c01'), 40, 'a prediction: +5');
update public.predictions set home_goals = 3 where fixture_id = 201;
select is(pg_temp.pts(201, 'c01'), 40, 'changing the prediction adds nothing');
insert into public.predictions (fixture_id, home_goals, away_goals) values (202, 1, 1);
select is((select count(*)::int from public.crowd_war_fans where fixture_id = 202), 0, 'a prediction before the window counts nothing');

-- ── lineup: 5 once ──
select lives_ok($$ select public.save_fan_lineup(201, '4-3-3',
  pg_temp.xi(array['mhf_40','mhf_17','mhf_3','mhf_35','mhf_2','mhf_4','mhf_36','mhf_8','mhf_29','mhf_9','mhf_7'])) $$, 'a fan lineup is saved');
select is(pg_temp.pts(201, 'c01'), 45, 'a lineup: +5');
select public.save_fan_lineup(201, '4-3-3',
  pg_temp.xi(array['mhf_40','mhf_17','mhf_3','mhf_35','mhf_2','mhf_4','mhf_36','mhf_8','mhf_29','mhf_9','mhf_10']));
select is(pg_temp.pts(201, 'c01'), 45, 'changing the lineup adds nothing: 45 is the most a fan gives');
select results_eq($$ select chat::int, posts::int, predicted, lineup from public.crowd_war_fans where fixture_id = 201 $$,
  $$ values (20, 3, true, true) $$, 'the fan reads their own counters');
reset role;

-- Square posts are deleted after 24 hours (or by their owner): the points stay.
delete from public.clips where user_id = pg_temp.uid('c01');
select is(pg_temp.pts(201, 'c01'), 45, 'deleting the posts keeps their points');

-- ── other fans ──
select pg_temp.chat('c02', 2);
-- A message the moderation filter refuses is never saved, so it scores nothing.
select throws_ok($$ insert into public.team_messages (user_id, body) values (pg_temp.uid('c02'), 'מוות לערבים') $$,
  '23514', 'offensive_content', 'a racist message is refused');
select is(pg_temp.pts(201, 'c02'), 2, 'a refused message scores nothing');
select pg_temp.chat('c03', 1);
select pg_temp.as_fan('c03');
set local role authenticated;
insert into public.predictions (fixture_id, home_goals, away_goals) values (201, 0, 1);
reset role;
select pg_temp.as_fan('c04');
set local role authenticated;
insert into public.predictions (fixture_id, home_goals, away_goals) values (201, 1, 1);
reset role;
select is((select count(*)::int from public.crowd_war_fans where fixture_id = 201 and user_id = pg_temp.uid('c04')), 0,
  'a fan of another club counts nothing in this war');
select pg_temp.chat('c05', 1);
select is((select count(*)::int from public.crowd_war_fans where user_id = pg_temp.uid('c05')), 0,
  'a club with no match in the window collects nothing');

-- Maccabi Tel Aviv: team chat goes to its match in the window (203, a demo match), the match room counts too.
select pg_temp.chat('c04', 1);
insert into public.match_messages (fixture_id, user_id, body) values (203, pg_temp.uid('c04'), 'קדימה');
select is(pg_temp.pts(203, 'c04'), 2, 'team chat + match room message: 2 points (demo matches count)');
insert into public.match_messages (fixture_id, user_id, body) values (204, pg_temp.uid('c04'), 'יאללה');
select is((select count(*)::int from public.crowd_war_fans where fixture_id = 204), 0, 'nothing after kick-off');

-- A prediction made before the window, changed once the window is open: +5.
select pg_temp.as_fan('c02');
set local role authenticated;
insert into public.predictions (fixture_id, home_goals, away_goals) values (202, 0, 0);
reset role;
select is(pg_temp.pts(202, 'c02'), 0, 'the early prediction scores nothing');
update public.fixtures set kickoff_at = now() + interval '20 hours' where id = 202;
select pg_temp.as_fan('c02');
set local role authenticated;
update public.predictions set away_goals = 2 where fixture_id = 202;
reset role;
select is(pg_temp.pts(202, 'c02'), 5, 'changing it inside the window: +5');

-- ── totals ──
select results_eq($$ select team_id, points, fans from public.crowd_war_totals where fixture_id = 201 order by team_id $$,
  $$ values ('bei'::text, 6, 1), ('mhf'::text, 47, 2) $$, 'club totals: points and fans');
select is((select count(*)::int from public.crowd_war_totals t
            where t.points <> (select coalesce(sum(f.points), 0) from public.crowd_war_fans f
                                where f.fixture_id = t.fixture_id and f.team_id = t.team_id)
               or t.fans <> (select count(*) from public.crowd_war_fans f
                              where f.fixture_id = t.fixture_id and f.team_id = t.team_id)), 0,
  'totals equal the sum of the fans');

-- ── who reads what ──
select pg_temp.as_fan('c02');
set local role authenticated;
select results_eq($$ select fixture_id, user_id from public.crowd_war_fans order by fixture_id $$,
  $$ values (201::bigint, pg_temp.uid('c02')), (202::bigint, pg_temp.uid('c02')) $$, 'a fan reads only their own fan rows');
select is((select count(*)::int from public.crowd_war_totals where fixture_id = 201), 2, 'a signed-in fan reads the totals');
select throws_ok($$ insert into public.crowd_war_fans (fixture_id, user_id, team_id, chat) values (201, auth.uid(), 'mhf', 20) $$,
  '42501', null, 'a fan cannot write points');
reset role;

-- ── at kick-off the war is final ──
select pg_temp.as_fan('c04');
set local role authenticated;
select is((select count(*)::int from public.crowd_war_totals where fixture_id = 201), 2, 'a fan of another club reads the totals too');
reset role;
-- A fan leaving before kick-off takes their points with them.
delete from auth.users where id = pg_temp.uid('c04');
select results_eq($$ select points, fans from public.crowd_war_totals where fixture_id = 203 and team_id = 'mta' $$,
  $$ values (0, 0) $$, 'an account deleted before kick-off counts down');
select is((select count(*)::int from public.crowd_war_totals t
            where t.points <> (select coalesce(sum(f.points), 0) from public.crowd_war_fans f
                                where f.fixture_id = t.fixture_id and f.team_id = t.team_id)
               or t.fans <> (select count(*) from public.crowd_war_fans f
                              where f.fixture_id = t.fixture_id and f.team_id = t.team_id)), 0,
  'after the account delete the totals still equal the sum of the fans');
update public.fixtures set kickoff_at = now() - interval '1 minute' where id = 201;
select pg_temp.chat('c03', 1);
delete from auth.users where id = pg_temp.uid('c03');
select is((select points from public.crowd_war_totals where fixture_id = 201 and team_id = 'bei'), 6,
  'after kick-off nothing changes the result');

-- ── season record ──
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (205, 383, 2026, 'R0', now() - interval '3 days', 'FT', 650, 651),
  (206, 383, 2026, 'R0', now() - interval '4 days', 'FT', 651, 650),
  (207, 383, 2026, 'R0', now() - interval '5 days', 'FT', 650, 651),
  (208, 383, 2026, 'R0', now() - interval '6 days', 'FT', 651, 650),
  (209, 383, 2025, 'R0', now() - interval '300 days', 'FT', 650, 651),
  (210, 383, 2026, 'R0', now() - interval '7 days', 'FT', 604, 650);
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id, is_demo) values
  (211, 383, 2026, 'R0', now() - interval '8 days', 'FT', 650, 651, true);   -- a demo match: never in the record
insert into public.crowd_war_totals (fixture_id, team_id, points, fans) values
  (205, 'mhf', 10, 2), (205, 'bei', 4, 1),    -- mhf wins
  (206, 'mhf', 2, 1), (206, 'bei', 8, 2),     -- bei wins
  (207, 'bei', 5, 1),                          -- only bei scored: bei wins
  (208, 'mhf', 3, 1), (208, 'bei', 3, 1),     -- draw
  (209, 'mhf', 9, 1), (209, 'bei', 1, 1),     -- last season
  (210, 'mhf', 4, 1),                          -- only mhf scored against mta
  (211, 'mhf', 50, 3), (211, 'bei', 1, 1);    -- demo: left out
select pg_temp.as_fan('c02');
set local role authenticated;
select results_eq($$ select * from public.crowd_war_record('mhf', 2026) $$, $$ values (3, 2, 1) $$,
  'mhf: wins 201, 205, 210; losses 206, 207; draw 208; last season and the demo match left out');
select results_eq($$ select * from public.crowd_war_record('bei', 2026) $$, $$ values (2, 2, 1) $$,
  'bei: the mirror, without the match against mta');
select results_eq($$ select * from public.crowd_war_record('hbs', 2026) $$, $$ values (0, 0, 0) $$, 'no wars: zeros');
reset role;

select * from finish();
rollback;
