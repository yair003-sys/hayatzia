-- Match rooms: who may write, when, and on which side.
begin;
select plan(12);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'e1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'e2@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'e3@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000e2', 'אדום', 'hta'),
  ('00000000-0000-0000-0000-0000000000e3', 'ירוק', 'mhf');

insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv'), (4510, 'Ironi Kiryat Shmona');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (1, 383, 2026, 'R1', now() + interval '10 minutes', 'NS', 604, 4486),   -- open (pre-match)
  (2, 383, 2026, 'R1', now() + interval '2 hours', 'NS', 604, 4486),      -- not open yet
  (3, 383, 2026, 'R1', now() - interval '3 hours', 'FT', 604, 4486);      -- closed

select is(public.club_of_api(604), 'mta', 'API id maps to the club');
select is(public.club_of_api(4510), 'ikn', 'Kiryat Shmona''s API name maps too');
select ok(public.match_room_open(now(), now() + interval '169 minutes') and not public.match_room_open(now(), now() + interval '170 minutes'),
  'room closes 170 minutes after kick-off');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.match_messages (fixture_id, body) values (1, 'יאללה') $$, 'home fan writes in an open room');
select is((select side::text from public.match_messages where fixture_id = 1), 'h', 'home fan is on the home side');
select throws_ok($$ insert into public.match_messages (fixture_id, body) values (2, 'מוקדם') $$, 'P0001', 'room_closed', 'room not open yet');
select throws_ok($$ insert into public.match_messages (fixture_id, body) values (3, 'מאוחר') $$, 'P0001', 'room_closed', 'room already closed');
select throws_ok($$ insert into public.match_messages (fixture_id, body, side) values (1, 'צד אחר', 'a') $$, '42501', null, 'cannot choose the side');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.match_messages (fixture_id, body) values (1, 'אדום עולה') $$, 'away fan writes');
select is((select side::text from public.match_messages where nick = 'אדום'), 'a', 'away fan is on the away side');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.match_messages (fixture_id, body) values (1, 'שלום') $$, '42501', 'not_playing', 'fans of other clubs can only read');
select is((select count(*)::int from public.match_messages where fixture_id = 1), 2, 'but they can read the room');
reset role;

select * from finish();
rollback;
