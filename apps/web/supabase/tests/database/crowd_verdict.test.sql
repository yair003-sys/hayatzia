-- Crowd verdict: who may vote, on what, until when; tallies move by trigger.
begin;
select plan(16);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'c2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c3@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000c2', 'אדום', 'hta'),
  ('00000000-0000-0000-0000-0000000000c3', 'ירוק', 'mhf');

insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (11, 383, 2026, 'R1', now() - interval '50 minutes', '2H', 604, 4486);

insert into public.match_polls (id, fixture_id, kind, question, options, options_in, source, voter_scope, opens_at, closes_at) values
  ('00000000-0000-0000-0000-00000000aa01', 11, 'penalty', 'פנדל?',
   '[{"id":"yes","emoji":"✅","label":"פנדל"},{"id":"no","emoji":"❌","label":"לא"}]', null, 'chat', null, now(), now() + interval '90 seconds'),
  ('00000000-0000-0000-0000-00000000aa02', 11, 'penalty', 'פנדל?',
   '[{"id":"yes","emoji":"✅","label":"פנדל"}]', null, 'chat', null, now() - interval '2 minutes', now() - interval '1 second'),
  ('00000000-0000-0000-0000-00000000aa03', 11, 'sub60', 'חילוף: מי יוצא ומי נכנס?',
   '[{"id":"604:7","emoji":"7","label":"שחקן 7"}]', '[{"id":"604:14","emoji":"14","label":"שחקן 14"}]', 'schedule', 'mta', now(), now() + interval '90 seconds');

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.n(p uuid, r text, o text, g text) returns int language sql as $$
  select coalesce((select n from public.match_poll_tallies where poll_id = p and row_kind = r and option_id = o and voter_group = g), 0)
$$;

-- home fan
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select throws_ok($$ insert into public.match_polls (fixture_id, kind, question, options, source, opens_at, closes_at)
  values (11, 'red', 'x', '[]', 'chat', now(), now()) $$, '42501', null, 'fans cannot create polls');
select lives_ok($$ insert into public.match_poll_votes (poll_id, option_id) values ('00000000-0000-0000-0000-00000000aa01', 'yes') $$, 'home fan votes');
select is((select voter_group::text from public.match_poll_votes where user_id = '00000000-0000-0000-0000-0000000000c1'), 'h', 'home fan counted as home');
select is(pg_temp.n('00000000-0000-0000-0000-00000000aa01', 'o', 'yes', 'h'), 1, 'tally counts the vote');
select lives_ok($$ update public.match_poll_votes set option_id = 'no' where poll_id = '00000000-0000-0000-0000-00000000aa01' $$, 'fan changes the vote');
select ok(pg_temp.n('00000000-0000-0000-0000-00000000aa01', 'o', 'yes', 'h') = 0 and pg_temp.n('00000000-0000-0000-0000-00000000aa01', 'o', 'no', 'h') = 1,
  'changing the vote moves one count');
select throws_ok($$ insert into public.match_poll_votes (poll_id, option_id) values ('00000000-0000-0000-0000-00000000aa02', 'yes') $$, 'P0001', 'poll_closed', 'late vote rejected');
select throws_ok($$ insert into public.match_poll_votes (poll_id, option_id) values ('00000000-0000-0000-0000-00000000aa03', 'nope', '604:14') $$, '22023', 'bad_option', 'unknown option rejected');
select throws_ok($$ insert into public.match_poll_votes (poll_id, option_id) values ('00000000-0000-0000-0000-00000000aa03', '604:7') $$, '22023', 'bad_option', 'substitution vote needs both players');
select lives_ok($$ insert into public.match_poll_votes (poll_id, option_id, option_in) values ('00000000-0000-0000-0000-00000000aa03', '604:7', '604:14') $$, 'club fan votes on the substitution');
select ok(pg_temp.n('00000000-0000-0000-0000-00000000aa03', 'o', '604:7', 'h') = 1 and pg_temp.n('00000000-0000-0000-0000-00000000aa03', 'i', '604:14', 'h') = 1,
  'both rows of the substitution are counted');
reset role;

-- away fan
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select lives_ok($$ insert into public.match_poll_votes (poll_id, option_id) values ('00000000-0000-0000-0000-00000000aa01', 'yes') $$, 'away fan votes');
select is((select count(*)::int from public.match_poll_votes), 1, 'fans see only their own votes');
reset role;

-- neutral fan
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select throws_ok($$ insert into public.match_poll_votes (poll_id, option_id, option_in) values ('00000000-0000-0000-0000-00000000aa03', '604:7', '604:14') $$, '42501', 'not_allowed', 'neutral fan cannot vote on a club-only card');
select ok((select count(*) from public.match_poll_tallies where poll_id = '00000000-0000-0000-0000-00000000aa03') > 0, 'but sees its results');
select lives_ok($$ insert into public.match_poll_votes (poll_id, option_id) values ('00000000-0000-0000-0000-00000000aa01', 'yes') $$, 'neutral fan votes on an open poll');
reset role;

select * from finish();
rollback;
