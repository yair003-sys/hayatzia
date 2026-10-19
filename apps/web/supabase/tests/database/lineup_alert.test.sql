-- Phase 5: the line-up-published alert. A trigger on fixture_details queues one 'lineup' match_alert the moment a
-- match's line-ups go from empty to published — once, and only for a match about to be played (never a late back-fill
-- of an old or finished match).
begin;
select plan(10);

insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv')
  on conflict (api_id) do nothing;

-- 81 upcoming (fires), 82 old match (outside the window), 83 finished, 84 upcoming (line-ups arrive with the insert).
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (81, 383, 2026, 'R1', now() + interval '1 hour',  'NS', 604, 4486),
  (82, 383, 2025, 'R1', now() - interval '5 hours', 'NS', 604, 4486),
  (83, 383, 2026, 'R1', now() - interval '1 hour',  'FT', 604, 4486),
  (84, 383, 2026, 'R1', now() + interval '1 hour',  'NS', 4486, 604);

-- A published line-up (shape does not matter to the trigger, only emptiness).
create function pg_temp.lu() returns jsonb language sql as $$
  select '[{"team":604,"f":"4-3-3","coach":"c","xi":[],"sub":[]}]'::jsonb
$$;

-- The kind check now admits 'lineup'.
select lives_ok(
  $$ insert into public.match_alerts (fixture_id, kind, home_goals, away_goals) values (81, 'lineup', 0, 0) $$,
  'match_alerts accepts kind lineup');
delete from public.match_alerts where fixture_id = 81;

-- Inserting empty line-ups must not fire (every fixture starts with fixture_details.lineups = []).
insert into public.fixture_details (fixture_id, events, lineups) values (81, '[]'::jsonb, '[]'::jsonb);
insert into public.fixture_details (fixture_id, events, lineups) values (82, '[]'::jsonb, '[]'::jsonb);
insert into public.fixture_details (fixture_id, events, lineups) values (83, '[]'::jsonb, '[]'::jsonb);
select is((select count(*)::int from public.match_alerts where kind = 'lineup'), 0,
  'empty line-ups queue no alert');

-- Publishing the line-ups of the upcoming match fires exactly one lineup alert.
update public.fixture_details set lineups = pg_temp.lu() where fixture_id = 81;
select is((select count(*)::int from public.match_alerts where kind = 'lineup' and fixture_id = 81), 1,
  'publishing line-ups queues one lineup alert');
select is((select (home_goals + away_goals)::int from public.match_alerts where kind = 'lineup' and fixture_id = 81), 0,
  'the lineup alert carries no score (0:0)');
select ok((select scoring_api_id is null from public.match_alerts where kind = 'lineup' and fixture_id = 81),
  'the lineup alert has no scorer');

-- A second write of the (still non-empty) line-ups must not fire again.
update public.fixture_details set lineups = pg_temp.lu() || pg_temp.lu() where fixture_id = 81;
select is((select count(*)::int from public.match_alerts where kind = 'lineup' and fixture_id = 81), 1,
  'a later line-up edit does not re-fire');

-- An old match being back-filled with line-ups must not push retroactively.
update public.fixture_details set lineups = pg_temp.lu() where fixture_id = 82;
select is((select count(*)::int from public.match_alerts where kind = 'lineup' and fixture_id = 82), 0,
  'a back-filled old match queues no alert');

-- A finished match must not fire either.
update public.fixture_details set lineups = pg_temp.lu() where fixture_id = 83;
select is((select count(*)::int from public.match_alerts where kind = 'lineup' and fixture_id = 83), 0,
  'a finished match queues no alert');

-- Line-ups that arrive already-published on insert (within the window) fire once.
insert into public.fixture_details (fixture_id, events, lineups) values (84, '[]'::jsonb, pg_temp.lu());
select is((select count(*)::int from public.match_alerts where kind = 'lineup' and fixture_id = 84), 1,
  'line-ups present on insert queue one alert');

select is((select count(*)::int from public.match_alerts where kind = 'lineup'), 2,
  'exactly two lineup alerts across all fixtures (81 and 84)');

select * from finish();
rollback;
