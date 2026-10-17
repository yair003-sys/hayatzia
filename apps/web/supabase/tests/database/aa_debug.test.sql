-- TEMP debug: reproduce the verified-female women-only request to read the exact error. Remove after.
begin;
select plan(1);
create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
insert into auth.users (id, aud, role, email) values
  (pg_temp.uid(14), 'authenticated', 'authenticated', 'd14@test.local'),
  (pg_temp.uid(9),  'authenticated', 'authenticated', 'd9@test.local');
insert into public.profiles (user_id, nick, team_id, created_at, birth_date, gender) values
  (pg_temp.uid(14), 'drv', 'mta', now() - interval '30 days', '1990-01-01', 'f'),
  (pg_temp.uid(9),  'vff', 'mta', now() - interval '30 days', '1990-01-01', 'f');
insert into public.api_teams (api_id, name) values (604, 'MTA'), (4500, 'HH') on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (9104, 383, 2026, 'R4', now() + interval '2 days', 'NS', 604, 4500);
insert into public.trips (user_id, fixture_id, kind, from_city, pickup, seats, women_only) values
  (pg_temp.uid(14), 9104, 'offer', 'חיפה', 'תחנה', 3, true);
insert into public.fan_verifications (user_id, kind, status, doc_fingerprint, is_female, approved_at, expires_at) values
  (pg_temp.uid(9), 'identity', 'approved', repeat('a', 64), null, now(), now() + interval '2 years');
update private.app_settings set value = 'true' where key = 'rides_require_verification';
select set_config('t.tw', (select id::text from public.trips where fixture_id = 9104), true);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(9), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('insert into public.trip_requests (trip_id) values (%L)', current_setting('t.tw')),
  'ZZZZZ', 'capture-the-real-error', 'DEBUG');
reset role;
select * from finish();
rollback;
