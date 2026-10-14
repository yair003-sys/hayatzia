-- Fan lineup ("ההרכב של האוהדים"): a fan's XI for their own club's next match, saved only through
-- save_fan_lineup before kick-off, counted by trigger into per-slot tallies and per-club totals (counts only).
begin;
select plan(49);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'e1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'e2@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'e3@test.local'),
  ('00000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'e4@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000e2', 'כחול', 'mta'),
  ('00000000-0000-0000-0000-0000000000e3', 'אדום', 'hta');
-- e4 is signed in but has no profile yet.
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv'), (9999, 'Nobody FC');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (51, 383, 2026, 'R1', now() + interval '1 day', 'NS', 604, 4486),      -- open
  (52, 383, 2026, 'R1', now() - interval '1 minute', 'NS', 604, 4486),   -- kicked off (status not yet updated)
  (53, 383, 2026, 'R1', now() + interval '1 day', '1H', 4486, 604),      -- started by the feed
  (54, 383, 2026, 'R1', now() + interval '1 day', 'NS', 4486, 9999),     -- not mta's match
  (55, 383, 2026, 'R1', now() + interval '2 days', 'FT', 604, 9999);     -- finished

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
-- Slots 0..10 in array order.
create function pg_temp.xi(p text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('slot', i - 1, 'player_id', x) order by i) from unnest(p) with ordinality u(x, i)
$$;
create function pg_temp.picks(p_fixture bigint) returns integer language sql as $$
  select coalesce(sum(picks), 0)::int from public.fan_lineup_tallies where fixture_id = p_fixture
$$;

-- A real Maccabi XI, and a second one (two swapped, one changed).
create function pg_temp.a() returns jsonb language sql as $$
  select pg_temp.xi(array['mta_1','mta_14','mta_5','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9','mta_11'])
$$;
create function pg_temp.b() returns jsonb language sql as $$
  select pg_temp.xi(array['mta_1','mta_5','mta_14','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9','mta_50'])
$$;

-- ── who may call ──
select ok(not has_function_privilege('anon', 'public.save_fan_lineup(bigint, text, jsonb)', 'execute'), 'anon cannot save a lineup');
select ok(not has_function_privilege('anon', 'public.clear_fan_lineup(bigint)', 'execute'), 'anon cannot clear a lineup');
set local role anon;
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3', '[]'::jsonb) $$, '42501', null, 'a signed-out visitor is refused');
select throws_ok($$ select * from public.fan_lineup_tallies $$, '42501', null, 'anon cannot read the tallies');
reset role;
select hasnt_column('public', 'fan_lineup_tallies', 'user_id', 'tallies carry no fan ids');
select hasnt_column('public', 'fan_lineup_totals', 'user_id', 'totals carry no fan ids');

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e4');
set local role authenticated;
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3', pg_temp.a()) $$, '42501', 'no profile', 'a fan without a club cannot save');
reset role;

-- ── first saves ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select is((select team_id from public.save_fan_lineup(51, '4-3-3', pg_temp.a())), 'mta', 'a fan saves an XI before kick-off, stamped with their club');
select is((select slots from public.fan_lineups where fixture_id = 51), pg_temp.a(), 'the XI is stored slot by slot');
select throws_ok($$ insert into public.fan_lineups (fixture_id, formation, slots) values (51, '4-3-3', pg_temp.a()) $$,
  '42501', null, 'no direct insert');
select throws_ok($$ update public.fan_lineups set formation = '4-4-2' $$, '42501', null, 'no direct update');
select throws_ok($$ delete from public.fan_lineups $$, '42501', null, 'no direct delete');
select throws_ok($$ insert into public.fan_lineup_tallies (fixture_id, team_id, formation, slot, player_id, picks) values (51, 'mta', '4-3-3', 0, 'mta_1', 99) $$,
  '42501', null, 'tallies cannot be written by fans');
reset role;

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select lives_ok($$ select public.save_fan_lineup(51, '4-3-3', pg_temp.a()) $$, 'a second fan saves the same XI');
select is((select count(*)::int from public.fan_lineups), 1, 'a fan sees only their own lineup');
select is((select fans from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), 2, 'two fans counted');
select is((select formations from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), '{"4-3-3": 2}'::jsonb, 'formation counts');
select is((select picks from public.fan_lineup_tallies where fixture_id = 51 and team_id = 'mta' and formation = '4-3-3' and slot = 0 and player_id = 'mta_1'),
  2, 'the goalkeeper slot: 2 picks');
select is(pg_temp.picks(51), 22, '11 picks per fan');
reset role;

-- ── re-saving replaces exactly (Review Focus 2) ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select lives_ok($$ select public.save_fan_lineup(51, '4-3-3', pg_temp.a()) $$, 'saving the same XI again is fine');
select is(pg_temp.picks(51), 22, 'saving the same XI again does not double count');
select is((select fans from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), 2, 'still two fans');
-- Slots sent out of order are stored in slot order.
select lives_ok($$ select public.save_fan_lineup(51, '4-4-2',
  (select jsonb_agg(e order by (e ->> 'slot')::int desc) from jsonb_array_elements(pg_temp.b()) e)) $$,
  'a fan changes formation and players');
select is((select slots from public.fan_lineups where fixture_id = 51), pg_temp.b(), 'the new XI replaces the old one, in slot order');
select is(pg_temp.picks(51), 22, 'changing the XI moves picks, never adds');
select is((select fans from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), 2, 'still two fans after the change');
select is((select formations from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), '{"4-3-3": 1, "4-4-2": 1}'::jsonb,
  'the formation count moved');
select results_eq($$ select formation, count(*)::int, min(picks), max(picks) from public.fan_lineup_tallies
                     where fixture_id = 51 and team_id = 'mta' group by formation order by formation $$,
  $$ values ('4-3-3'::text, 11, 1, 1), ('4-4-2'::text, 11, 1, 1) $$, 'each formation keeps exactly one XI, no empty rows');
select is((select picks from public.fan_lineup_tallies where fixture_id = 51 and formation = '4-4-2' and slot = 10), 1,
  'the changed slot has the new player');
select is((select sum(picks)::int from public.fan_lineup_tallies where fixture_id = 51 and player_id = 'mta_11'), 1,
  'the dropped player lost one pick');
reset role;

-- ── locked at kick-off (Review Focus 1) ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.save_fan_lineup(52, '4-3-3', pg_temp.a()) $$, 'P0001', 'locked', 'no lineup after kick-off');
select throws_ok($$ select public.save_fan_lineup(53, '4-3-3', pg_temp.a()) $$, 'P0001', 'locked', 'no lineup once the match started');
select throws_ok($$ select public.save_fan_lineup(55, '4-3-3', pg_temp.a()) $$, 'P0001', 'locked', 'no lineup for a finished match');

-- ── own club, real players, 11 distinct (Review Focus 3) ──
select throws_ok($$ select public.save_fan_lineup(54, '4-3-3', pg_temp.a()) $$, '42501', 'not_your_match', 'only your club''s match');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  pg_temp.xi(array['mta_1','mta_14','mta_5','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9','hta_1'])) $$,
  '42501', 'not_your_player', 'no players of another club');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  pg_temp.xi(array['mta_c','mta_14','mta_5','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9','mta_11'])) $$,
  '42501', 'not_your_player', 'the coach is not a player');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  pg_temp.xi(array['nobody','mta_14','mta_5','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9','mta_11'])) $$,
  '42501', 'not_your_player', 'no made-up players');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  pg_temp.xi(array['mta_1','mta_1','mta_5','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9','mta_11'])) $$,
  '22023', 'bad_players', 'eleven different players');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  pg_temp.xi(array['mta_1','mta_14','mta_5','mta_13','mta_6','mta_x14','mta_17','mta_28','mta_10','mta_9'])) $$,
  '22023', 'bad_slots', 'exactly eleven');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  jsonb_set(pg_temp.a(), '{10,slot}', '11')) $$, '22023', 'bad_slots', 'slots are 0..10');
select throws_ok($$ select public.save_fan_lineup(51, '4-3-3',
  jsonb_set(pg_temp.a(), '{10,slot}', '0')) $$, '22023', 'bad_slots', 'each slot once');
select throws_ok($$ select public.save_fan_lineup(51, '4-5-1', pg_temp.a()) $$, '22023', 'bad_formation', 'known formations only');
select is(pg_temp.picks(51), 22, 'refused saves change nothing');

-- others' counts are readable (counts only)
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
select is((select fans from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), 2, 'any signed-in fan reads the counts');
select is((select count(*)::int from public.fan_lineups), 0, 'but not anyone''s lineup');
reset role;

-- ── clearing ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select is(public.clear_fan_lineup(51), true, 'a fan clears their lineup before kick-off');
select is((select formations from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), '{"4-4-2": 1}'::jsonb,
  'clearing takes the fan out of the counts');
reset role;

-- kick-off passes: the remaining lineup is frozen
update public.fixtures set kickoff_at = now() - interval '1 minute' where id = 51;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.clear_fan_lineup(51) $$, 'P0001', 'locked', 'no clearing after kick-off');
reset role;

-- an account going takes its lineup out of the counts
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';
select is(pg_temp.picks(51) + (select fans from public.fan_lineup_totals where fixture_id = 51 and team_id = 'mta'), 0,
  'a deleted account leaves no counts behind');

select * from finish();
rollback;
