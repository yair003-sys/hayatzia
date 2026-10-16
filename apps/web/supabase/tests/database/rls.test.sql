-- Security rules, tested against a fresh local database with every migration applied (supabase test db).
begin;
select plan(19);

-- Two fans of Maccabi Tel Aviv, one of Hapoel Tel Aviv.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@test.local');

-- Every public table has row level security on.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every public table has RLS enabled');

-- Privileges are explicit: anon has nothing on profiles, authenticated may only update the nickname.
select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anon has no access to profiles');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'team_id', 'update'), 'team_id is not updatable by fans');

-- Reference data
select is((select count(*)::int from public.teams), 14, '14 clubs seeded');
set local role anon;
select is((select count(*)::int from public.teams), 14, 'anon can read clubs');
select lives_ok($$ select * from public.fixtures limit 1 $$, 'anon can read fixtures');
select throws_ok($$ insert into public.api_teams (api_id, name) values (1, 'x') $$, '42501', null, 'anon cannot write league data');
select throws_ok($$ insert into public.profiles (user_id, nick, team_id) values ('00000000-0000-0000-0000-00000000000a', 'x', 'mta') $$,
  '42501', null, 'anon cannot create profiles');
reset role;

-- Fan A creates a profile, only for themselves.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.profiles (user_id, nick, team_id, terms_version, birth_date) values ('00000000-0000-0000-0000-00000000000a', 'אוהד א', 'mta', '2026-10-15', '1990-01-01') $$,
  'a fan creates their own profile');
select throws_ok($$ insert into public.profiles (user_id, nick, team_id, terms_version) values ('00000000-0000-0000-0000-00000000000b', 'מתחזה', 'mta', '2026-10-15') $$,
  '42501', null, 'a fan cannot create a profile for someone else');
select throws_ok($$ update public.profiles set team_id = 'hta' where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'the team cannot be changed (column grant)');
select lives_ok($$ update public.profiles set nick = 'שם חדש' where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  'the nickname can be changed');
select is((select nick::text from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), 'שם חדש', 'nickname saved');
select is(public.my_team(), 'mta', 'my_team() returns the fan''s club');
reset role;

-- The trigger also guards the lock when the column grant is bypassed (e.g. by a privileged role).
select throws_ok($$ update public.profiles set team_id = 'hta' where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', 'team is locked for this fan', 'trigger blocks a team change even for the owner role');

-- Fan B (same club) and fan C (other club).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.profiles (user_id, nick, team_id, terms_version, birth_date) values ('00000000-0000-0000-0000-00000000000b', 'אוהד ב', 'mta', '2026-10-15', '1990-01-01') $$,
  'second fan joins the same club');
select is((select count(*)::int from public.profiles), 2, 'a fan sees fans of their own club');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.profiles (user_id, nick, team_id, terms_version, birth_date) values ('00000000-0000-0000-0000-00000000000c', 'אוהד ג', 'hta', '2026-10-15', '1990-01-01') $$,
  'a fan of another club joins');
select is((select count(*)::int from public.profiles), 1, 'fans of other clubs are not visible');
reset role;

select * from finish();
rollback;
