-- Territory (migration 20261114050000_territory): a fan can read the whole map but can never write a cell directly —
-- capture goes only through the service-role action; the capture log is closed to clients entirely.
begin;
select plan(5);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000d91', 'authenticated', 'authenticated', 'd91@test.local');
insert into public.profiles (user_id, nick, team_id, birth_date) values
  ('00000000-0000-0000-0000-000000000d91', 'כובש91', 'mta', '1990-01-01');

-- Seed a held cell and a log row as the system (service role bypasses RLS, like the real capture action).
insert into public.territory (h3, team_id, user_id, nick) values ('88283082a3fffff', 'hta', '00000000-0000-0000-0000-000000000d91', 'כובש91');
insert into public.territory_log (user_id, h3, lat, lng) values ('00000000-0000-0000-0000-000000000d91', '88283082a3fffff', 32.08, 34.78);

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;

select pg_temp.as_fan('d91');
set local role authenticated;

select is((select count(*)::int from public.territory), 1, 'a fan reads the whole map');
select throws_ok($$ insert into public.territory (h3, team_id, user_id, nick) values ('8928308280fffff', 'mta', '00000000-0000-0000-0000-000000000d91', 'כובש91') $$,
  '42501', null, 'a fan cannot capture a cell directly');
select throws_ok($$ update public.territory set team_id = 'mta' where h3 = '88283082a3fffff' $$,
  '42501', null, 'a fan cannot repaint a cell directly');
select throws_ok($$ delete from public.territory where h3 = '88283082a3fffff' $$,
  '42501', null, 'a fan cannot free a cell directly');
select throws_ok($$ select count(*) from public.territory_log $$,
  '42501', null, 'the capture log is closed to fans');

reset role;
select * from finish();
rollback;
