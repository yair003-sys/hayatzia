-- Ride safety pack (migration 20261015220000_ride_safety): gender and 18+ on the profile, women-only rides, the phone
-- setting, ratings and driver stats (completions ledger), the ride lock after kickoff, suspended and banned fans,
-- immediate suspension from rides on a harm report with its abuse guards, lifting it, and the open case.
begin;
select plan(93);

-- f01 male driver, f02 female rider, f03 male rider, f04 not 18+, f05 female driver, f06 another club, f07 admin,
-- f08 a fan who never confirmed 18+, f09 an adult with a 2-day-old account.
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-000000000f0' || g)::uuid, 'authenticated', 'authenticated', 'f0' || g || '@test.local'
  from generate_series(1, 9) g;
-- Inserted as postgres, so created_at is kept as given.
insert into public.profiles (user_id, nick, team_id, created_at) values
  ('00000000-0000-0000-0000-000000000f01', 'נהג', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f02', 'נוסעת', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f03', 'נוסע', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f04', 'צעיר', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f05', 'נהגת', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f06', 'יריב', 'hta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f07', 'מנהל', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f08', 'מדווח', 'mta', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f09', 'חדשה', 'mta', now() - interval '2 days');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-000000000f07');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4500, 'Hapoel Hadera')
  on conflict (api_id) do nothing;
-- 92 kicks off later in the test (its kickoff is moved to the past before the ratings).
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (91, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4500),
  (92, 383, 2026, 'R2', now() + interval '1 day', 'NS', 604, 4500);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-000000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.suspended(p text) returns boolean language sql as $$
  select exists (select 1 from public.ride_suspensions s where s.user_id = pg_temp.uid(p) and s.lifted_at is null)
$$;

-- ---------- 1. the profile: gender, 18+, safety screen ----------
select pg_temp.as_fan('f01');
set local role authenticated;
update public.profiles set gender = 'm', adult_confirmed_at = '2000-01-01T00:00:00Z', ride_safety_seen_at = '2000-01-01T00:00:00Z'
 where user_id = auth.uid();
reset role;
select ok((select gender = 'm' and adult_confirmed_at > now() - interval '1 minute' and ride_safety_seen_at > now() - interval '1 minute'
             from public.profiles where user_id = pg_temp.uid('f01')),
  'a fan sets their own gender and confirmations; the times are the database''s');

select pg_temp.as_fan('f01');
set local role authenticated;
update public.profiles set adult_confirmed_at = null where user_id = auth.uid();
reset role;
select ok((select adult_confirmed_at is not null from public.profiles where user_id = pg_temp.uid('f01')),
  'a confirmation, once given, cannot be cleared');

-- The others: 18+ confirmed by the database directly (the stamp applies the same way).
update public.profiles set adult_confirmed_at = now(), gender = 'f', birth_date = '1990-01-01'
 where user_id in (pg_temp.uid('f02'), pg_temp.uid('f05'), pg_temp.uid('f09'));
update public.profiles set adult_confirmed_at = now(), gender = 'm', birth_date = '1990-01-01'
 where user_id in (pg_temp.uid('f01'), pg_temp.uid('f03'), pg_temp.uid('f06'), pg_temp.uid('f07'));
-- Since 20261016100000_league_dms 18+ comes from the birth date: f04 is 17, f08 never gave one.
update public.profiles set birth_date = (current_date - interval '17 years')::date where user_id = pg_temp.uid('f04');

select pg_temp.as_fan('f03');
set local role authenticated;
update public.profiles set gender = 'f', adult_confirmed_at = now() where user_id = pg_temp.uid('f04');
select throws_ok($$ select gender from public.profiles $$, '42501', null, 'other fans'' gender is not readable');
select throws_ok($$ select adult_confirmed_at from public.profiles where user_id = auth.uid() $$, '42501', null,
  'the ride columns are read only through my_ride_profile');
select throws_ok($$ update public.profiles set terms_version = 'x' where user_id = auth.uid() $$, '42501', null,
  'a fan cannot change other profile columns');
select is((select count(*)::int from public.profiles), 8, 'fans of the club are still listed (nick, join date)');
reset role;
select ok((select gender is null and adult_confirmed_at is null from public.profiles where user_id = pg_temp.uid('f04')),
  'a fan cannot set another fan''s gender or 18+');

select pg_temp.as_fan('f05');
set local role authenticated;
select results_eq($$ select gender, adult_confirmed, safety_seen, ride_suspended, phone_required from public.my_ride_profile() $$,
  $$ values ('f'::text, true, false, false, false) $$, 'a fan reads their own ride state');
reset role;

-- ---------- 2. offering: 18+, women-only ----------
select pg_temp.as_fan('f04');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (91, 'offer', 'חיפה', 'תחנת רכבת', 2) $$,
  '42501', 'not_adult', 'a fan who did not confirm 18+ cannot offer a ride');
reset role;

select pg_temp.as_fan('f01');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats, women_only) values (91, 'offer', 'חיפה', 'תחנת רכבת', 2, true) $$,
  '42501', 'women_only', 'only a female driver marks a ride women-only');
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (91, 'offer', 'חיפה', 'תחנת רכבת', 3) $$,
  'an adult driver offers a ride');
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (92, 'offer', 'חיפה', 'חניון האצטדיון', 2) $$,
  'a ride to the earlier match');
select is((select pickup::text from public.trips where fixture_id = 92), 'חניון האצטדיון', 'the pickup point is kept');
reset role;

select pg_temp.as_fan('f05');
set local role authenticated;
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats, women_only) values (91, 'offer', 'נתניה', 'צומת מרכזי', 3, true) $$,
  'a female driver offers a women-only ride');
reset role;

select set_config('t.t91', (select id::text from public.trips where user_id = pg_temp.uid('f01') and fixture_id = 91), true);
select set_config('t.t92', (select id::text from public.trips where user_id = pg_temp.uid('f01') and fixture_id = 92), true);
select set_config('t.tw', (select id::text from public.trips where user_id = pg_temp.uid('f05')), true);

-- ---------- 3. requesting: 18+, women-only, phone setting, banned fans ----------
select pg_temp.as_fan('f04');
set local role authenticated;
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t91')::uuid) $$,
  '42501', 'not_adult', 'a fan who did not confirm 18+ cannot request a ride');
reset role;

select pg_temp.as_fan('f03');
set local role authenticated;
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.tw')::uuid) $$,
  '42501', 'women_only', 'a male fan cannot request a women-only ride');
reset role;

select pg_temp.as_fan('f02');
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.tw')::uuid) $$, 'a female fan requests a women-only ride');
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t91')::uuid) $$, 'request the next match ride');
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t92')::uuid) $$, 'request the earlier match ride');
reset role;

select pg_temp.as_fan('f09');
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t91')::uuid) $$, 'a new account may ride');
reset role;

update private.app_settings set value = 'true' where key = 'rides_require_phone';
select pg_temp.as_fan('f03');
set local role authenticated;
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t92')::uuid) $$,
  '42501', 'phone_required', 'with the setting on, a fan without a verified phone cannot request');
select is((select phone_required from public.my_ride_profile()), true, 'the fan sees that a phone is required');
reset role;
update auth.users set phone_confirmed_at = now() where id = pg_temp.uid('f03');
select pg_temp.as_fan('f03');
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t92')::uuid) $$,
  'with a verified phone the request goes through');
reset role;
select pg_temp.as_fan('f01');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (91, 'seek', 'חיפה', 'תחנת רכבת', 0) $$,
  '42501', 'phone_required', 'with the setting on, offering needs a verified phone too');
reset role;
update private.app_settings set value = 'false' where key = 'rides_require_phone';

-- A fan suspended from writing (fan_bans) can neither request, offer nor accept.
insert into public.fan_bans (user_id, until) values (pg_temp.uid('f03'), null), (pg_temp.uid('f05'), null);
select pg_temp.as_fan('f03');
set local role authenticated;
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.t91')::uuid) $$,
  '42501', 'banned', 'a banned fan cannot request a ride');
reset role;
select pg_temp.as_fan('f05');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (91, 'offer', 'נתניה', 'צומת מרכזי', 3) $$,
  '42501', 'banned', 'a banned fan cannot offer a ride');
select throws_ok($$ update public.trip_requests set status = 'accepted' where trip_id = current_setting('t.tw')::uuid $$,
  '42501', 'banned', 'a banned driver cannot accept a rider');
reset role;
select pg_temp.as_fan('f01');
set local role authenticated;
select throws_ok($$ update public.trip_requests set status = 'accepted' where user_id = pg_temp.uid('f03') $$,
  '42501', 'banned', 'a banned rider cannot be accepted');
reset role;
delete from public.fan_bans;

-- The driver accepts f02 on both rides and f03 on the earlier one.
select pg_temp.as_fan('f01');
set local role authenticated;
update public.trip_requests set status = 'accepted' where user_id = pg_temp.uid('f02');
update public.trip_requests set status = 'accepted' where user_id = pg_temp.uid('f03');
reset role;
select is((select count(*)::int from public.trip_requests where status = 'accepted' and trip_id in
            (current_setting('t.t91')::uuid, current_setting('t.t92')::uuid)), 3, 'the driver accepted the riders');

-- ---------- 4. kickoff: the ride is locked; ratings and stats ----------
update public.fixtures set kickoff_at = now() - interval '3 hours' where id = 92;

select pg_temp.as_fan('f01');
set local role authenticated;
select throws_ok($$ update public.trip_requests set status = 'declined' where trip_id = current_setting('t.t92')::uuid and user_id = pg_temp.uid('f02') $$,
  'P0001', 'ride_started', 'after kickoff the driver cannot decline a rider (no rating sabotage)');
delete from public.trips where id = current_setting('t.t92')::uuid;
select is((select count(*)::int from public.trips where id = current_setting('t.t92')::uuid), 1,
  'after kickoff a ride with accepted riders cannot be deleted');
reset role;

select pg_temp.as_fan('f02');
set local role authenticated;
select results_eq($$ select trip_id::text, driver_nick from public.my_rides_to_rate() $$,
  $$ values (current_setting('t.t92'), 'נהג'::text) $$, 'the rider is asked to rate the finished ride only');
select throws_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.t91')::uuid, 5) $$,
  'P0001', 'ride_not_over', 'no rating before the match is over');
select throws_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.tw')::uuid, 5) $$,
  '42501', 'not_a_rider', 'only an accepted rider rates');
select lives_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.t92')::uuid, 4) $$,
  'an accepted rider rates the driver after the match');
select throws_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.t92')::uuid, 5) $$,
  '23505', null, 'once per ride');
select throws_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.t92')::uuid, 9) $$,
  '23514', null, 'stars are 1 to 5');
select is((select count(*)::int from public.my_rides_to_rate()), 0, 'a rated ride is not asked again');
reset role;
select pg_temp.as_fan('f05');
set local role authenticated;
select throws_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.t92')::uuid, 1) $$,
  '42501', 'not_a_rider', 'a fan who was not on the ride cannot rate');
reset role;
select results_eq($$ select ratings_count, ratings_sum, rides_completed from public.ride_driver_stats where driver_id = pg_temp.uid('f01') $$,
  $$ values (1, 4, 0) $$, 'the rating is counted on the driver''s stats');

update public.fixtures set status = 'FT' where id = 92;
select is((select rides_completed from public.ride_driver_stats where driver_id = pg_temp.uid('f01')), 1,
  'a ride with an accepted rider counts as completed when the match ends');
update public.fixtures set status = 'FT' where id = 92;
select is((select rides_completed from public.ride_driver_stats where driver_id = pg_temp.uid('f01')), 1, 'counted once');
update public.fixtures set status = '2H' where id = 92;
select is((select rides_completed from public.ride_driver_stats where driver_id = pg_temp.uid('f01')), 0,
  'a final status taken back removes exactly what was counted');
update public.fixtures set status = 'AET' where id = 92;
select is((select rides_completed from public.ride_driver_stats where driver_id = pg_temp.uid('f01')), 1, 'and counts it again, once');
select is((select count(*)::int from public.ride_completions), 1, 'one ledger row per completed ride');

-- A female fan who only seeks rides is never revealed.
select pg_temp.as_fan('f02');
set local role authenticated;
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup) values (91, 'seek', 'חדרה', 'תחנת רכבת') $$, 'a rider seeks a ride');
reset role;
select pg_temp.as_fan('f03');
set local role authenticated;
select results_eq(
  $$ select user_id::text, rides_completed, ratings_count, ratings_sum, female from public.ride_drivers(array[
       pg_temp.uid('f01'), pg_temp.uid('f05'), pg_temp.uid('f06'), pg_temp.uid('f04'), pg_temp.uid('f02')]) order by user_id $$,
  $$ values ('00000000-0000-0000-0000-000000000f01', 1, 1, 4, false), ('00000000-0000-0000-0000-000000000f05', 0, 0, 0, true) $$,
  'trust facts for drivers of active ride offers in the club only (a seeker says nothing)');
select is((select count(*)::int from public.ride_driver_stats), 1, 'driver stats are readable in the club');
select is((select count(*)::int from public.ride_ratings), 0, 'other fans'' ratings are not readable');
reset role;
select pg_temp.as_fan('f06');
set local role authenticated;
select is((select count(*)::int from public.ride_drivers(array[pg_temp.uid('f01')])), 0, 'another club learns nothing');
select is((select count(*)::int from public.ride_driver_stats), 0, 'another club reads no stats');
reset role;

-- ---------- 5. harm report: when it suspends, and when it only alerts ----------
-- A fan who never confirmed 18+ reports f03: no suspension, but the case is open.
select pg_temp.as_fan('f08');
set local role authenticated;
insert into public.reports (kind, ref, reason) values ('user', pg_temp.uid('f03')::text, 'הטרדה או פגיעה בנסיעה');
reset role;
select ok(not pg_temp.suspended('f03'), 'a report from a non-ride user does not suspend');
select pg_temp.as_fan('f03');
set local role authenticated;
select is(public.my_ride_case_open(), true, 'an open harm report alone keeps the case open');
reset role;

-- A 2-day-old account that shared the ride does not suspend (brigading with fresh accounts).
select pg_temp.as_fan('f09');
set local role authenticated;
select results_eq($$ select suspended from public.report_ride_harm('trip', current_setting('t.t91')) $$, $$ values (false) $$,
  'a new account''s harm report only alerts the admins');
reset role;
select ok(not pg_temp.suspended('f01'), 'no suspension from a new account');

-- A fan who never shared a ride with the target does not suspend.
select pg_temp.as_fan('f05');
set local role authenticated;
insert into public.reports (kind, ref, reason) values ('user', pg_temp.uid('f01')::text, 'הטרדה או פגיעה בנסיעה');
reset role;
select ok(not pg_temp.suspended('f01'), 'no suspension without a shared ride in the last 30 days');

-- A report against an admin, or for another reason, never suspends.
select pg_temp.as_fan('f02');
set local role authenticated;
insert into public.reports (kind, ref, reason) values ('user', pg_temp.uid('f07')::text, 'הטרדה או פגיעה בנסיעה');
insert into public.reports (kind, ref, reason) values ('trip', current_setting('t.t91'), 'ספאם');
select throws_ok($$ select * from public.report_ride_harm('clip', 'x') $$, '22023', 'bad_kind', 'the harm report is for rides and fans only');
reset role;
select is((select count(*)::int from public.ride_suspensions), 0, 'no suspension of an admin or for another reason');

-- The rider reports the driver's ride: suspended at once.
select pg_temp.as_fan('f02');
set local role authenticated;
select results_eq($$ select suspended from public.report_ride_harm('trip', current_setting('t.t91'), 'פרטים') $$, $$ values (true) $$,
  'the rider''s harm report suspends the driver, and says so');
select is((select count(*)::int from public.trips where user_id = pg_temp.uid('f01')), 0, 'the reported driver''s rides disappear at once');
reset role;
select ok(pg_temp.suspended('f01'), 'the reported driver is suspended from rides');
select is((select count(*)::int from public.admin_actions where action = 'ride_suspend' and target_user = pg_temp.uid('f01')), 1,
  'the suspension is in the audit trail');
select is((select array_agg(x order by x) from public.ride_suspension_riders(
            (select by_report from public.ride_suspensions where user_id = pg_temp.uid('f01'))) x),
  array[pg_temp.uid('f02')], 'the accepted riders of the driver''s upcoming rides are found, to be told');
select ok(has_function_privilege('service_role', 'public.ride_suspension_riders(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.ride_suspension_riders(uuid)', 'execute'),
  'only the server finds them');

-- The same reporter cannot suspend a second fan within 7 days.
select pg_temp.as_fan('f02');
set local role authenticated;
select results_eq($$ select suspended from public.report_ride_harm('user', pg_temp.uid('f05')::text) $$, $$ values (false) $$,
  'one automatic suspension per reporter in 7 days');
reset role;
select ok(not pg_temp.suspended('f05'), 'the second fan is not suspended');

-- The suspended driver cannot counter-suspend the rider (or anyone).
select pg_temp.as_fan('f01');
set local role authenticated;
select results_eq($$ select suspended from public.report_ride_harm('user', pg_temp.uid('f03')::text) $$, $$ values (false) $$,
  'a fan with an open ride case suspends no one');
reset role;
select ok(not pg_temp.suspended('f03'), 'no counter-suspension');

-- A rider can still rate a suspended driver.
select pg_temp.as_fan('f03');
set local role authenticated;
select is((select count(*)::int from public.my_rides_to_rate()), 1, 'the hidden ride is still offered for rating');
select lives_ok($$ insert into public.ride_ratings (trip_id, stars) values (current_setting('t.t92')::uuid, 2) $$,
  'a rider rates a suspended driver');
reset role;

select pg_temp.as_fan('f01');
set local role authenticated;
select is((select count(*)::int from public.trips where user_id = auth.uid()), 2, 'the driver still sees their own rides');
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (91, 'offer', 'חיפה', 'תחנת רכבת', 3) $$,
  '42501', 'ride_suspended', 'a suspended fan cannot offer');
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.tw')::uuid) $$,
  '42501', 'ride_suspended', 'a suspended fan cannot request');
delete from public.trips where user_id = auth.uid();
select is((select count(*)::int from public.trips where user_id = auth.uid()), 2, 'rides are kept while the case is open');
select is(public.my_ride_case_open(), true, 'the account cannot be deleted during the case');
select is((select ride_suspended from public.my_ride_profile()), true, 'the fan sees the suspension');
select lives_ok($$ insert into public.team_messages (body) values ('עדיין כותב בצ׳אט') $$, 'normal posting is not affected');
reset role;

-- ---------- 6. the admin lifts it ----------
select pg_temp.as_fan('f02');
set local role authenticated;
select throws_ok($$ select * from public.admin_ride_suspensions() $$, '42501', 'not_admin', 'fans cannot list ride suspensions');
select throws_ok($$ select public.admin_lift_ride_suspension(pg_temp.uid('f01')) $$, '42501', 'not_admin', 'fans cannot lift one');
select throws_ok($$ select count(*) from public.ride_suspensions $$, '42501', null, 'the suspensions table is closed to fans');
select throws_ok($$ select count(*) from public.ride_completions $$, '42501', null, 'the completions ledger is closed to fans');
reset role;

select pg_temp.as_fan('f07');
set local role authenticated;
select is((select count(*)::int from public.admin_ride_suspensions()), 1, 'the admin sees the suspension');
select is(public.admin_lift_ride_suspension(pg_temp.uid('f01')), true, 'the admin lifts the driver''s suspension');
reset role;
select is((select count(*)::int from public.admin_actions where action = 'ride_unsuspend' and target_user = pg_temp.uid('f01')), 1,
  'lifting is in the audit trail');

select pg_temp.as_fan('f05');
set local role authenticated;
select is((select count(*)::int from public.trips where user_id = pg_temp.uid('f01')), 2, 'the driver''s rides are back');
reset role;

select pg_temp.as_fan('f01');
set local role authenticated;
select is(public.my_ride_case_open(), true, 'the case stays open while a report is open');
reset role;
update public.reports set status = 'handled' where reason = 'הטרדה או פגיעה בנסיעה'
   and ((kind = 'trip' and ref = current_setting('t.t91')) or (kind = 'user' and ref = pg_temp.uid('f01')::text));
select pg_temp.as_fan('f01');
set local role authenticated;
select is(public.my_ride_case_open(), false, 'once handled, the account can be deleted again');
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (91, 'seek', 'חיפה', 'תחנת רכבת', 0) $$,
  'after lifting, the fan can ride again');
-- Now the driver (no case, old account, shared ride, no recent suspension) reports a rider: kind 'user'.
select results_eq($$ select suspended from public.report_ride_harm('user', pg_temp.uid('f03')::text) $$, $$ values (true) $$,
  'a harm report on a fan suspends that fan');
select is((select count(*)::int from public.trip_requests where user_id = pg_temp.uid('f03')), 0,
  'a suspended rider''s requests disappear from the driver''s list');
reset role;
select ok(pg_temp.suspended('f03'), 'the reported rider is suspended from rides');

-- ---------- 7. privileges ----------
select ok(not has_function_privilege('authenticated', 'public.admin_user_ids()', 'execute')
          and not has_function_privilege('anon', 'public.admin_user_ids()', 'execute')
          and has_function_privilege('service_role', 'public.admin_user_ids()', 'execute'),
  'the admin list for the urgent push is for the server only');
select ok(not has_table_privilege('authenticated', 'private.app_settings', 'select')
          and not has_column_privilege('authenticated', 'public.trips', 'hidden_at', 'INSERT')
          and not has_column_privilege('authenticated', 'public.reports', 'ride_suspended', 'INSERT'),
  'fans cannot read the settings or mark a report as suspending');

select * from finish();
rollback;
