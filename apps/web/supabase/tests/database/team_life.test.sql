-- Trips, events and the market: team-private, server-stamped, owner-controlled.
begin;
select plan(16);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'u21@test.local'),
  ('00000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'u22@test.local'),
  ('00000000-0000-0000-0000-000000000023', 'authenticated', 'authenticated', 'u23@test.local'),
  ('00000000-0000-0000-0000-000000000024', 'authenticated', 'authenticated', 'u24@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-000000000021', 'נהג', 'mta'),
  ('00000000-0000-0000-0000-000000000022', 'טרמפיסט', 'mta'),
  ('00000000-0000-0000-0000-000000000023', 'עוד אחד', 'mta'),
  ('00000000-0000-0000-0000-000000000024', 'יריב', 'hta');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4500, 'Hapoel Hadera');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id)
values (77, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4500);

-- Driver offers one seat.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, seats) values (77, 'offer', 'חיפה', 1) $$, 'offer a ride');
select is((select nick::text from public.trips), 'נהג', 'trip stamped with the driver''s nickname');
select throws_ok($$ insert into public.trip_requests (trip_id) select id from public.trips $$, '42501', 'own trip', 'cannot request your own trip');
select lives_ok($$ insert into public.fan_events (kind, title, starts_at, area) values ('screen', 'הקרנה משותפת', now() + interval '2 days', 'תל אביב') $$, 'create an event');
select throws_ok($$ insert into public.market_items (category, title, condition, price) values ('other', 'כרטיס ליציע', 'new', 100) $$,
  '23514', null, 'no tickets in the market');
select lives_ok($$ insert into public.market_items (category, title, condition, price) values ('scarf', 'צעיף סרוג', 'used', 40) $$, 'list an item');
reset role;

-- Two riders ask; only one fits.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) select id from public.trips $$, 'ask for a seat');
select is((with u as (update public.trip_requests set status = 'accepted' returning 1) select count(*)::int from u), 0,
  'riders cannot accept themselves');
select lives_ok($$ insert into public.fan_event_going (event_id) select id from public.fan_events $$, 'say "going"');
select is((with u as (update public.market_items set sold = true returning 1) select count(*)::int from u), 0,
  'cannot mark someone else''s item sold');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) select id from public.trips $$, 'second rider asks');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.trip_requests), 2, 'the driver sees both requests');
select lives_ok($$ update public.trip_requests set status = 'accepted' where user_id = '00000000-0000-0000-0000-000000000022' $$, 'driver accepts the first');
select throws_ok($$ update public.trip_requests set status = 'accepted' where user_id = '00000000-0000-0000-0000-000000000023' $$,
  'P0001', 'trip_full', 'no more riders than seats');
reset role;

select is((select going_count from public.fan_events), 1, 'going is counted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.trips) + (select count(*)::int from public.fan_events) + (select count(*)::int from public.market_items),
  0, 'other clubs see none of it');
reset role;

select * from finish();
rollback;
