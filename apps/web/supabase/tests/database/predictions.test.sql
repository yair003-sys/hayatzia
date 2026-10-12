-- Predictions: guess before kick-off only, points by the database, a season table per club.
begin;
select plan(13);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'd2@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'd3@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'd4@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'מדויק', 'mta'),
  ('00000000-0000-0000-0000-0000000000d2', 'כיוון', 'mta'),
  ('00000000-0000-0000-0000-0000000000d3', 'טועה', 'mta'),
  ('00000000-0000-0000-0000-0000000000d4', 'יריב', 'hta');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (41, 383, 2026, 'R1', now() + interval '1 day', 'NS', 604, 4486),
  (42, 383, 2026, 'R1', now() - interval '1 minute', 'NS', 604, 4486);

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.guess(p text, h int, a int) returns void language plpgsql as $$
begin
  perform pg_temp.as_fan(p);
  set local role authenticated;
  insert into public.predictions (fixture_id, home_goals, away_goals) values (41, h, a);
  reset role;
end $$;

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ insert into public.predictions (fixture_id, home_goals, away_goals) values (41, 1, 0) $$, 'a fan guesses before kick-off');
select is((select team_id from public.predictions where fixture_id = 41), 'mta', 'the guess is stamped with the fan''s club');
select lives_ok($$ update public.predictions set home_goals = 2, away_goals = 1 where fixture_id = 41 $$, 'the guess can change before kick-off');
select throws_ok($$ insert into public.predictions (fixture_id, home_goals, away_goals) values (42, 1, 1) $$, 'P0001', 'locked', 'no guess after kick-off');
select throws_ok($$ insert into public.predictions (fixture_id, home_goals, away_goals) values (41, 21, 0) $$, '23514', null, 'a score up to 20');
select throws_ok($$ update public.predictions set points = 99 where fixture_id = 41 $$, '42501', null, 'points cannot be set by fans');
reset role;

select pg_temp.guess('00000000-0000-0000-0000-0000000000d2', 1, 0);
select pg_temp.guess('00000000-0000-0000-0000-0000000000d3', 0, 0);
select pg_temp.guess('00000000-0000-0000-0000-0000000000d4', 2, 1);

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select is((select count(*)::int from public.predictions), 1, 'fans see only their own guesses');
reset role;

-- full time 2-1
update public.fixtures set kickoff_at = now() - interval '2 hours', status = 'FT', home_goals = 2, away_goals = 1 where id = 41;
select results_eq($$ select p.nick::text, t.points from public.prediction_totals t join public.profiles p using (user_id) where t.team_id = 'mta' order by t.points desc $$,
  $$ values ('מדויק'::text, 3), ('כיוון'::text, 1), ('טועה'::text, 0) $$, 'exact score 3, right direction 1, wrong 0');
select is((select exact from public.prediction_totals where user_id = '00000000-0000-0000-0000-0000000000d1'), 1, 'exact scores are counted for ties');
select is((select played from public.prediction_totals where user_id = '00000000-0000-0000-0000-0000000000d3'), 1, 'a scored guess counts as played');

-- the score is corrected to 1-1: points move, no double counting
update public.fixtures set home_goals = 1 where id = 41;
select results_eq($$ select p.nick::text, t.points from public.prediction_totals t join public.profiles p using (user_id) where t.team_id = 'mta' order by t.points desc, p.nick $$,
  $$ values ('טועה'::text, 1), ('כיוון'::text, 0), ('מדויק'::text, 0) $$, 'a corrected score re-scores everyone once');

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select is((select string_agg(team_id, ',') from public.prediction_totals), 'hta', 'the season table shows only your club');
reset role;
select is((select played from public.prediction_totals where user_id = '00000000-0000-0000-0000-0000000000d1'), 1, 'played is not counted twice');

select * from finish();
rollback;
