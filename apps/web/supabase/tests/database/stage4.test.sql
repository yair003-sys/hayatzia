-- Stage 4: "הייתי שם" by location (≤ 500 m, around the match), fans' player of the match (1–10), stand songs (reps only).
begin;
select plan(17);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b2@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'b3@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'בבית', 'mta'),
  ('00000000-0000-0000-0000-0000000000b2', 'נציג', 'mta'),
  ('00000000-0000-0000-0000-0000000000b3', 'יריב', 'hta');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id, venue) values
  (51, 383, 2026, 'R1', now() - interval '20 minutes', '1H', 604, 4486, 'Bloomfield Stadium'),   -- live, known stadium
  (52, 383, 2026, 'R1', now() + interval '3 hours', 'NS', 604, 4486, 'Bloomfield Stadium'),     -- not open yet
  (53, 383, 2026, 'R1', now() - interval '2 hours', 'FT', 604, 4486, 'Bloomfield Stadium'),     -- finished, room still open
  (54, 383, 2026, 'R1', now() - interval '20 minutes', '1H', 604, 4486, 'Unknown Ground');      -- live, unknown stadium

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;

-- ── "הייתי שם" ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($$ select public.check_in(51, 32.0650, 34.7616) $$, 'P0001', 'too_far', '1.5 km from Bloomfield is too far');
select is((public.check_in(51, 32.0530, 34.7616) ->> 'number')::int, 1, 'about 130 m away counts: first match of the season');
select is((public.check_in(51, 32.0530, 34.7616) ->> 'number')::int, 1, 'checking in twice is the same check-in');
select throws_ok($$ select public.check_in(52, 32.0518, 34.7616) $$, 'P0001', 'not_open', 'only around the match');
select throws_ok($$ select public.check_in(54, 32.0518, 34.7616) $$, 'P0001', 'no_venue', 'unknown stadium');
select throws_ok($$ insert into public.checkins (fixture_id) values (52) $$, '42501', null, 'no check-in without the location check');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b3');
set local role authenticated;
select is((public.check_in(51, 32.0518, 34.7616) ->> 'away')::boolean, true, 'the away club''s fan gets an away game');
reset role;

-- ── player of the match (1–10), after the final whistle while the room is open ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select lives_ok($$ insert into public.match_ratings (fixture_id, player_id, score) values (53, 'mta_9', 9) $$, 'a fan rates a player of their club after the match');
select throws_ok($$ insert into public.match_ratings (fixture_id, player_id, score) values (53, 'mta_10', 11) $$, '23514', null, 'scores are 1–10');
select throws_ok($$ insert into public.match_ratings (fixture_id, player_id, score) values (51, 'mta_9', 7) $$, 'P0001', 'not_finished', 'not during the match');
select throws_ok($$ insert into public.match_ratings (fixture_id, player_id, score) values (53, 'hta_9', 7) $$, '42501', 'not_your_player', 'only your club''s players');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select lives_ok($$ insert into public.match_ratings (fixture_id, player_id, score) values (53, 'mta_9', 7) $$, 'another fan rates');
select is((select round(sum::numeric / count, 1) from public.match_rating_stats where fixture_id = 53 and player_id = 'mta_9'), 8.0, 'the average is kept by trigger');
reset role;

-- ── stand songs: only the club's fan representative adds ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($$ insert into public.chants (title, lyrics) values ('שיר', 'מילים') $$, '42501', null, 'a regular fan cannot add a song');
reset role;
insert into public.club_reps (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000b2');
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select lives_ok($$ insert into public.chants (title, lyrics) values ('הצהובים עולים', 'אולה אולה') $$, 'the representative adds a song');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select lives_ok($$ insert into public.chant_fires (chant_id) select id from public.chants $$, 'a fan gives 🔥');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000b3');
set local role authenticated;
select is((select count(*)::int from public.chants), 0, 'a rival does not see the club''s songs');
reset role;

select * from finish();
rollback;
