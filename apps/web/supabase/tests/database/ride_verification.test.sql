-- Ride verification and the emergency button (migration 20261016200000_ride_verification): the rollout switch, the
-- gates per ride action, hiding unverified fans' rides, verification sessions and the provider result (service role
-- only, idempotent, birth date, duplicate identity, licence age, expiry), attempts and the admin reset, the admin birth
-- date fix, cars and plates, the verified badge data, and emergency incidents (who, window, rate limit, locks, admin).
begin;
select plan(89);

-- e01 driver, e02 rider, e03 second account (duplicate identity), e04 suspended from rides, e05 banned, e06 admin,
-- e07 unverified fan, e08 sessions and results, e09 expired approval.
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-000000000e0' || g)::uuid, 'authenticated', 'authenticated', 'e0' || g || '@test.local'
  from generate_series(1, 9) g;
insert into public.profiles (user_id, nick, team_id, created_at, birth_date, gender)
  select ('00000000-0000-0000-0000-000000000e0' || g)::uuid, 'אוהד' || g, 'mta', now() - interval '30 days', '1990-01-01', 'm'
  from generate_series(1, 9) g;
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-000000000e06');
insert into public.ride_suspensions (user_id, reason) values ('00000000-0000-0000-0000-000000000e04', 'בדיקה');
insert into public.fan_bans (user_id, reason) values ('00000000-0000-0000-0000-000000000e05', 'בדיקה');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4500, 'Hapoel Hadera')
  on conflict (api_id) do nothing;
-- 93 in three days, 94 in one hour (the emergency window is open), 95 in two days.
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (93, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4500),
  (94, 383, 2026, 'R2', now() + interval '1 hour', 'NS', 604, 4500),
  (95, 383, 2026, 'R3', now() + interval '2 days', 'NS', 604, 4500);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-000000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true)
$$;
-- Setup only (as the database owner): an approved verification, as the result RPC would leave it.
create function pg_temp.approve(p text, p_kind text, p_fp text default null) returns void language sql as $$
  insert into public.fan_verifications (user_id, kind, status, provider, provider_ref, doc_fingerprint, approved_at, expires_at)
    values (pg_temp.uid(p), p_kind, 'approved', 'mock', 'setup-' || p || '-' || p_kind, p_fp, now(), now() + interval '2 years')
$$;
create function pg_temp.fp(c text) returns text language sql as $$ select repeat(c, 64) $$;

-- ---------- 0. the switch ----------
select is((select value from private.app_settings where key = 'rides_require_verification'), 'false'::jsonb,
  'the verification switch is seeded off');
select pg_temp.as_fan('e07');
set local role authenticated;
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (93, 'offer', 'חיפה', 'תחנת רכבת', 2) $$,
  'switch off: an unverified fan still offers a ride');
reset role;

-- A request sent while the switch was off (accepting it is checked later).
select pg_temp.approve('e01', 'identity', pg_temp.fp('1'));
select pg_temp.approve('e01', 'licence');
insert into public.fan_cars (user_id, plate, make, model, colour, year) values (pg_temp.uid('e01'), '1234567', 'מאזדה', '3', 'לבן', 2019);
select pg_temp.as_fan('e01');
set local role authenticated;
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (93, 'offer', 'נתניה', 'צומת מרכזי', 3) $$,
  'a fully verified driver offers a ride');
reset role;
select set_config('t.offer', (select id::text from public.trips where user_id = pg_temp.uid('e01') and fixture_id = 93), true);
select pg_temp.as_fan('e08');
set local role authenticated;
insert into public.trip_requests (trip_id) values (current_setting('t.offer')::uuid);
reset role;

update private.app_settings set value = 'true' where key = 'rides_require_verification';

-- ---------- 1. hiding ----------
select pg_temp.as_fan('e02');
set local role authenticated;
select is((select count(*)::int from public.trips where user_id = pg_temp.uid('e07')), 0,
  'switch on: an unverified fan''s offer is hidden from others');
select is((select count(*)::int from public.trips where user_id = pg_temp.uid('e01')), 1, 'a verified driver''s offer is visible');
reset role;
select pg_temp.as_fan('e07');
set local role authenticated;
select is((select count(*)::int from public.trips where user_id = auth.uid()), 1, 'the fan still sees their own offer');
reset role;
select is((select count(*)::int from public.trips where user_id = pg_temp.uid('e07')), 1, 'nothing was deleted');

-- ---------- 2. the gates ----------
select pg_temp.as_fan('e09');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (93, 'offer', 'חיפה', 'תחנת רכבת', 2) $$,
  '42501', 'verify_identity', 'an unverified fan cannot offer a ride');
reset role;
select pg_temp.approve('e09', 'identity', pg_temp.fp('9'));
select pg_temp.as_fan('e09');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (93, 'offer', 'חיפה', 'תחנת רכבת', 2) $$,
  '42501', 'verify_licence', 'identity alone does not open offering');
reset role;
select pg_temp.approve('e09', 'licence');
select pg_temp.as_fan('e09');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (93, 'offer', 'חיפה', 'תחנת רכבת', 2) $$,
  '42501', 'no_car', 'a verified driver without a car cannot offer');
reset role;
-- Approvals expire.
update public.fan_verifications set expires_at = now() - interval '1 day' where user_id = pg_temp.uid('e09') and kind = 'identity';
select pg_temp.as_fan('e09');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup) values (95, 'seek', 'חיפה', 'תחנת רכבת') $$,
  '42501', 'verify_identity', 'an expired approval no longer counts');
reset role;

select pg_temp.as_fan('e02');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup) values (95, 'seek', 'חיפה', 'תחנת רכבת') $$,
  '42501', 'verify_identity', 'seeking a ride needs a verified identity');
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup) values (93, 'meet', 'חיפה', 'תחנת רכבת') $$,
  '"looking for friends for the way" is unaffected');
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.offer')::uuid) $$,
  '42501', 'verify_identity', 'requesting a seat needs a verified identity');
reset role;
select pg_temp.approve('e02', 'identity', pg_temp.fp('2'));
select pg_temp.as_fan('e02');
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.offer')::uuid) $$,
  'a verified rider requests a seat');
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup) values (95, 'seek', 'חיפה', 'תחנת רכבת') $$,
  'a verified fan seeks a ride');
reset role;
select set_config('t.seek', (select id::text from public.trips where user_id = pg_temp.uid('e02') and kind = 'seek'), true);
select set_config('t.meet', (select id::text from public.trips where user_id = pg_temp.uid('e02') and kind = 'meet'), true);

select pg_temp.approve('e07', 'identity', pg_temp.fp('7'));
select pg_temp.as_fan('e07');
set local role authenticated;
select throws_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.seek')::uuid) $$,
  '42501', 'verify_licence', 'answering a seek as the driver needs a licence (and a car)');
reset role;
select pg_temp.as_fan('e01');
set local role authenticated;
select lives_ok($$ insert into public.trip_requests (trip_id) values (current_setting('t.seek')::uuid) $$,
  'a fully verified driver answers a seek');

-- Accepting: the rider must be verified too.
select throws_ok($$ update public.trip_requests set status = 'accepted' where trip_id = current_setting('t.offer')::uuid and user_id = pg_temp.uid('e08') $$,
  '42501', 'peer_not_verified', 'a pending request of an unverified fan cannot be accepted');
select lives_ok($$ update public.trip_requests set status = 'accepted' where trip_id = current_setting('t.offer')::uuid and user_id = pg_temp.uid('e02') $$,
  'a verified rider is accepted');
reset role;

-- ---------- 3. sessions and results ----------
select pg_temp.as_fan('e08');
set local role authenticated;
select throws_ok($$ select public.verification_result(gen_random_uuid(), 'mock', 'x', true, null, null, null, null, null) $$,
  '42501', null, 'a fan cannot post a verification result');
select throws_ok($$ select public.begin_verification('passport') $$, '22023', 'bad_kind', 'only identity and licence');
select throws_ok($$ select public.begin_verification('licence') $$, '42501', 'verify_identity', 'the ID comes before the licence');
select throws_ok($$ select count(*) from public.fan_verifications $$, '42501', null, 'verification rows are closed to fans');
select throws_ok($$ select count(*) from public.fan_cars $$, '42501', null, 'cars are closed to fans');
select set_config('t.s1', public.begin_verification('identity')::text, true);
select is(public.my_verification_session(current_setting('t.s1')::uuid), 'identity', 'the fan reads their own pending session');
reset role;
select is((select status from public.fan_verifications where id = current_setting('t.s1')::uuid), 'pending', 'a session starts pending');
select pg_temp.as_fan('e02');
set local role authenticated;
select ok(public.my_verification_session(current_setting('t.s1')::uuid) is null, 'another fan''s session is not readable');
select throws_ok($$ select public.begin_verification('identity') $$, 'P0001', 'already_verified', 'no new session while approved');
reset role;

select pg_temp.as_service();
set local role service_role;
select is(public.verification_result(current_setting('t.s1')::uuid, 'mock', 'ref-1', true, null, pg_temp.fp('8'), '1991-01-01', null, null),
  'rejected', 'a birth date that does not match the profile is rejected');
reset role;
select is((select reason_code from public.fan_verifications where id = current_setting('t.s1')::uuid), 'dob_mismatch', 'reason dob_mismatch');

select pg_temp.as_fan('e08');
set local role authenticated;
select set_config('t.s2', public.begin_verification('identity')::text, true);
reset role;
select pg_temp.as_service();
set local role service_role;
select is(public.verification_result(current_setting('t.s2')::uuid, 'mock', 'ref-2', true, null, pg_temp.fp('8'), '1990-01-01', null, null),
  'approved', 'a matching ID is approved');
select is(public.verification_result(current_setting('t.s2')::uuid, 'mock', 'ref-2', false, 'declined', null, null, null, null),
  'approved', 'the same webhook again (even a different outcome) changes nothing');
select throws_ok($$ select public.verification_result(gen_random_uuid(), 'mock', 'ref-x', true, null, null, null, null, null) $$,
  'P0002', 'bad_session', 'an unknown session is refused');
reset role;
select ok((select status = 'approved' and approved_at is not null and expires_at > now() + interval '23 months'
             and doc_fingerprint = pg_temp.fp('8') and provider_ref = 'ref-2'
             from public.fan_verifications where id = current_setting('t.s2')::uuid),
  'approved for two years, with the fingerprint and the provider reference');

-- Licence: held at least 2 years; expiry from the document when earlier.
select pg_temp.as_fan('e08');
set local role authenticated;
select set_config('t.l1', public.begin_verification('licence')::text, true);
reset role;
select pg_temp.as_service();
set local role service_role;
select is(public.verification_result(current_setting('t.l1')::uuid, 'mock', 'ref-l1', true, null, null, '1990-01-01',
            (current_date - interval '1 year')::date, null), 'rejected', 'a licence held for one year is rejected');
reset role;
select is((select reason_code from public.fan_verifications where id = current_setting('t.l1')::uuid), 'licence_too_new', 'reason licence_too_new');
select pg_temp.as_fan('e08');
set local role authenticated;
select set_config('t.l2', public.begin_verification('licence')::text, true);
reset role;
select pg_temp.as_service();
set local role service_role;
select is(public.verification_result(current_setting('t.l2')::uuid, 'mock', 'ref-l2', true, null, null, '1990-01-01',
            (current_date - interval '5 years')::date, current_date + 100), 'approved', 'a licence held for five years is approved');
reset role;
select is((select expires_at::date from public.fan_verifications where id = current_setting('t.l2')::uuid), current_date + 100,
  'the approval ends at the licence''s own expiry');

-- Re-verifying after expiry with the same ID supersedes the old approval.
update public.fan_verifications set expires_at = now() - interval '1 day' where id = current_setting('t.s2')::uuid;
select pg_temp.as_fan('e08');
set local role authenticated;
select set_config('t.s3', public.begin_verification('identity')::text, true);
reset role;
select pg_temp.as_service();
set local role service_role;
select is(public.verification_result(current_setting('t.s3')::uuid, 'mock', 'ref-3', true, null, pg_temp.fp('8'), '1990-01-01', null, null),
  'approved', 'the same fan re-verifies with the same ID');
reset role;
select is((select count(*)::int from public.fan_verifications where user_id = pg_temp.uid('e08') and kind = 'identity' and status = 'approved'), 1,
  'one approved identity; the old one is marked expired');
select pg_temp.as_fan('e08');
set local role authenticated;
select throws_ok($$ select public.begin_verification('identity') $$, 'P0001', 'already_verified', 'approved again');
reset role;

-- Duplicate identity: another account, a fan suspended from rides, a banned fan.
select pg_temp.approve('e04', 'identity', pg_temp.fp('4'));
select pg_temp.approve('e05', 'identity', pg_temp.fp('5'));
select pg_temp.as_fan('e03');
set local role authenticated;
select set_config('t.d1', public.begin_verification('identity')::text, true);
select set_config('t.d2', public.begin_verification('identity')::text, true);
select set_config('t.d3', public.begin_verification('identity')::text, true);
select throws_ok($$ select public.begin_verification('identity') $$, 'P0001', 'verify_limit', 'three sessions per kind, then verify_limit');
reset role;
select pg_temp.as_service();
set local role service_role;
select is(public.verification_result(current_setting('t.d1')::uuid, 'mock', 'ref-d1', true, null, pg_temp.fp('2'), '1990-01-01', null, null),
  'rejected', 'an ID already approved on another account is rejected');
select is(public.verification_result(current_setting('t.d2')::uuid, 'mock', 'ref-d2', true, null, pg_temp.fp('4'), '1990-01-01', null, null),
  'rejected', 'the ID of a fan suspended from rides is rejected');
select is(public.verification_result(current_setting('t.d3')::uuid, 'mock', 'ref-d3', true, null, pg_temp.fp('5'), '1990-01-01', null, null),
  'rejected', 'the ID of a banned fan is rejected');
reset role;
select is((select count(*)::int from public.fan_verifications where user_id = pg_temp.uid('e03') and reason_code = 'duplicate_identity'), 3,
  'all three as duplicate_identity');

-- The admin resets the attempts (logged); others cannot.
select pg_temp.as_fan('e02');
set local role authenticated;
select throws_ok($$ select public.admin_reset_verification(pg_temp.uid('e03'), 'identity') $$, '42501', 'not_admin', 'only admins reset attempts');
select throws_ok($$ select public.admin_set_birth_date(pg_temp.uid('e03'), '1991-01-01') $$, '42501', 'not_admin', 'only admins fix a birth date');
select throws_ok($$ select * from public.admin_verification_issues() $$, '42501', 'not_admin', 'only admins list verification issues');
reset role;
select pg_temp.as_fan('e06');
set local role authenticated;
select ok(exists (select 1 from public.admin_verification_issues() where user_id = pg_temp.uid('e03') and kind = 'identity' and used = 3),
  'the admin sees the fan who used all attempts');
select is(public.admin_reset_verification(pg_temp.uid('e03'), 'identity'), 3, 'the admin resets three attempts');
select lives_ok($$ select public.admin_set_birth_date(pg_temp.uid('e03'), '1991-01-01') $$, 'the admin corrects a birth date');
select throws_ok($$ select public.admin_set_birth_date(pg_temp.uid('e03'), current_date + 1) $$, '22023', 'bad_date', 'still checked');
reset role;
select is((select birth_date from public.profiles where user_id = pg_temp.uid('e03')), '1991-01-01'::date, 'the birth date is corrected');
select is((select count(*)::int from public.admin_actions where target_user = pg_temp.uid('e03') and action in ('verify_reset', 'birth_date_fix')), 2,
  'both admin actions are logged');
select pg_temp.as_fan('e03');
set local role authenticated;
select lives_ok($$ select public.begin_verification('identity') $$, 'after the reset the fan can try again');
reset role;

-- ---------- 4. cars, plates, the badge ----------
select pg_temp.as_fan('e09');
set local role authenticated;
select throws_ok($$ select public.set_fan_car(auth.uid(), '7654321', 'קיה', 'פיקנטו', 'אדום', 2020) $$, '42501', null,
  'a fan cannot write a car without the registry check');
reset role;
select pg_temp.as_service();
set local role service_role;
select throws_ok($$ select public.set_fan_car(pg_temp.uid('e09'), '12', 'קיה', 'פיקנטו', 'אדום', 2020) $$, '22023', 'bad_plate', 'a plate is 7–8 digits');
select lives_ok($$ select public.set_fan_car(pg_temp.uid('e09'), '7654321', 'קיה', 'פיקנטו', 'אדום', 2020) $$, 'the server registers a checked car');
select lives_ok($$ select public.set_fan_car(pg_temp.uid('e09'), '76543210', 'טויוטה', 'קורולה', 'כסף', 2021) $$, 'a new car replaces the old one');
reset role;
select is((select count(*)::int from public.fan_cars where user_id = pg_temp.uid('e09') and active), 1, 'one active car per driver');

select pg_temp.as_fan('e01');
set local role authenticated;
select results_eq($$ select identity_status, licence_status, car_make, required from public.my_verification() $$,
  $$ values ('approved'::text, 'approved'::text, 'מאזדה'::text, true) $$, 'the fan reads their own verification state');
reset role;
select pg_temp.as_fan('e02');
set local role authenticated;
select results_eq($$ select plate from public.my_ride_plates(array[current_setting('t.offer')::uuid]) $$,
  $$ values ('1234567'::text) $$, 'an accepted rider sees the plate');
select results_eq($$ select identity_ok, driver_ok, car_make from public.ride_trust(array[pg_temp.uid('e01'), pg_temp.uid('e07')]) order by user_id $$,
  $$ values (true, true, 'מאזדה'::text), (true, false, null::text) $$, 'the badge data: verified fan, verified driver, car');
reset role;
select pg_temp.as_fan('e08');
set local role authenticated;
select is((select count(*)::int from public.my_ride_plates(array[current_setting('t.offer')::uuid])), 0, 'a pending rider does not see the plate');
reset role;

-- ---------- 5. emergency ----------
select pg_temp.as_fan('e01');
set local role authenticated;
insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (94, 'offer', 'רעננה', 'תחנת רכבת', 3);
reset role;
select set_config('t.e', (select id::text from public.trips where user_id = pg_temp.uid('e01') and fixture_id = 94), true);
select pg_temp.as_fan('e02');
set local role authenticated;
insert into public.trip_requests (trip_id) values (current_setting('t.e')::uuid);
reset role;
select pg_temp.as_fan('e07');
set local role authenticated;
insert into public.trip_requests (trip_id) values (current_setting('t.e')::uuid);
reset role;
select pg_temp.as_fan('e01');
set local role authenticated;
update public.trip_requests set status = 'accepted' where trip_id = current_setting('t.e')::uuid and user_id = pg_temp.uid('e02');
reset role;

select pg_temp.as_fan('e07');
set local role authenticated;
select throws_ok($$ select * from public.report_ride_emergency(current_setting('t.e')::uuid) $$, '42501', 'not_in_ride',
  'a fan who was not accepted cannot raise an emergency');
reset role;
select pg_temp.as_fan('e02');
set local role authenticated;
select throws_ok($$ select * from public.report_ride_emergency(current_setting('t.meet')::uuid) $$, '42501', 'not_in_ride', 'not on a meet');
select throws_ok($$ select * from public.report_ride_emergency(current_setting('t.offer')::uuid) $$, 'P0001', 'emergency_window',
  'not three days before the match');
select results_eq($$ select created, from_city, fixture_id from public.report_ride_emergency(current_setting('t.e')::uuid) $$,
  $$ values (true, 'רעננה'::text, 94::bigint) $$, 'an accepted rider raises an emergency');
select results_eq($$ select created from public.report_ride_emergency(current_setting('t.e')::uuid) $$,
  $$ values (false) $$, 'again within 10 minutes: no new incident');
reset role;
select is((select count(*)::int from public.ride_incidents where trip_id = current_setting('t.e')::uuid), 1, 'one incident');
select ok((select status = 'open' and driver_id = pg_temp.uid('e01') and reporter_id = pg_temp.uid('e02') and car like '%מאזדה%'
             from public.ride_incidents where trip_id = current_setting('t.e')::uuid),
  'open, with the driver, the reporter and the car');
select pg_temp.as_fan('e01');
set local role authenticated;
select results_eq($$ select created from public.report_ride_emergency(current_setting('t.e')::uuid) $$,
  $$ values (true) $$, 'the driver can raise one too');
delete from public.trips where id = current_setting('t.e')::uuid;
select is(public.my_ride_case_open(), true, 'the driver''s ride case is open');
reset role;
select is((select count(*)::int from public.trips where id = current_setting('t.e')::uuid), 1, 'the trip cannot be deleted while open');
select pg_temp.as_fan('e02');
set local role authenticated;
delete from public.trip_requests where trip_id = current_setting('t.e')::uuid and user_id = auth.uid();
select is(public.my_ride_case_open(), true, 'the rider''s ride case is open');
select throws_ok($$ select * from public.admin_open_incidents() $$, '42501', 'not_admin', 'only admins list incidents');
reset role;
select is((select count(*)::int from public.trip_requests where trip_id = current_setting('t.e')::uuid and user_id = pg_temp.uid('e02')), 1,
  'the request cannot be withdrawn while open');

select pg_temp.as_fan('e06');
set local role authenticated;
select is(public.admin_incident_count(), 2, 'two unanswered incidents');
select ok((select bool_and(car like '%1234567%' and from_city = 'רעננה') from public.admin_open_incidents()), 'the admin sees route and car');
select is((select public.admin_ack_incident(id) from public.ride_incidents where reporter_id = pg_temp.uid('e02')), true, 'acknowledged');
select is(public.admin_incident_count(), 1, 'one left unanswered');
select is((select count(*)::int from public.admin_open_incidents()), 2, 'acknowledged incidents stay open in the list');
select is((select bool_and(public.admin_close_incident(id)) from public.ride_incidents), true, 'both closed');
select is(public.admin_incident_count(), 0, 'nothing unanswered');
reset role;
select is((select count(*)::int from public.admin_actions where action in ('incident_ack', 'incident_close')), 3, 'logged');
select pg_temp.as_fan('e01');
set local role authenticated;
delete from public.trips where id = current_setting('t.e')::uuid;
reset role;
select is((select count(*)::int from public.trips where id = current_setting('t.e')::uuid), 0, 'once closed, the trip can be deleted again');

select ok(not has_function_privilege('authenticated', 'public.verification_result(uuid, text, text, boolean, text, text, date, date, date)', 'execute')
          and has_function_privilege('service_role', 'public.verification_result(uuid, text, text, boolean, text, text, date, date, date)', 'execute'),
  'the result RPC is service role only');

select * from finish();
rollback;
