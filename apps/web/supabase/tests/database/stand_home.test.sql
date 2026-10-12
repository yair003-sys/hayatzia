-- Stand home: verified-fans counter by trigger; presence channels for "online now" and "in the room".
begin;
select plan(7);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'f1@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'f2@test.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'f3@test.local');

create function pg_temp.fans(t text) returns int language sql as $$
  select coalesce((select fans from public.team_stats where team_id = t), 0)
$$;
select is(pg_temp.fans('snk'), 0, 'no fans yet');

insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'אחד', 'snk'),
  ('00000000-0000-0000-0000-0000000000f2', 'שתיים', 'snk'),
  ('00000000-0000-0000-0000-0000000000f3', 'שלוש', 'itb');
select is(pg_temp.fans('snk'), 2, 'each new fan is counted');
select is(pg_temp.fans('itb'), 1, 'per club');

delete from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
select is(pg_temp.fans('snk'), 1, 'a deleted profile is uncounted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select is((select string_agg(team_id, ',') from public.team_stats), 'snk', 'a fan reads only their own club''s numbers');
reset role;

select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and policyname = 'presence_receive' and qual like '%presence%' and qual like '%online:%' and qual like '%room:%'),
  'presence can be received on online:<my club> and room:<match>');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and policyname = 'presence_track' and cmd = 'INSERT' and with_check like '%presence%'),
  'presence can be tracked');

select * from finish();
rollback;
