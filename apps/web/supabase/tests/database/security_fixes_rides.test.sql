-- Security fixes 2026-10-17 — rides: H1 (harm-report link must be an accepted, kicked-off ride, and the linking
-- request is kept while a fan is in an open case) and M3 (gender set once; women-only needs a verified-female when the
-- verification switch is on). Migration 20261017130000_security_fixes.
begin;
select plan(20);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.as_fan(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.suspended(n int) returns boolean language sql as $$
  select exists (select 1 from public.ride_suspensions s where s.user_id = pg_temp.uid(n) and s.lifted_at is null)
$$;

-- 1 rA, 2 tA (pending); 3 rB, 4 tB (accepted pre-kickoff); 5 rC, 6 tC (accepted post-kickoff);
-- 7 gm (sets gender), 8 ad (admin); 9 vff female+id, 10 vfm male+id, 11 mkt male+marker, 12 fkf female+marker-false,
-- 13 uff female no id, 14 drv (women-only offer owner). All mta, adult, old accounts.
insert into auth.users (id, aud, role, email)
  select pg_temp.uid(g), 'authenticated', 'authenticated', 'sf' || g || '@test.local' from generate_series(1, 14) g;
insert into public.profiles (user_id, nick, team_id, created_at, birth_date, gender) values
  (pg_temp.uid(1),  'rA',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(2),  'tA',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(3),  'rB',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(4),  'tB',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(5),  'rC',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(6),  'tC',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(7),  'gm',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(8),  'ad',  'mta', now() - interval '30 days', '1990-01-01', null),
  (pg_temp.uid(9),  'vff', 'mta', now() - interval '30 days', '1990-01-01', 'f'),
  (pg_temp.uid(10), 'vfm', 'mta', now() - interval '30 days', '1990-01-01', 'm'),
  (pg_temp.uid(11), 'mkt', 'mta', now() - interval '30 days', '1990-01-01', 'm'),
  (pg_temp.uid(12), 'fkf', 'mta', now() - interval '30 days', '1990-01-01', 'f'),
  (pg_temp.uid(13), 'uff', 'mta', now() - interval '30 days', '1990-01-01', 'f'),
  (pg_temp.uid(14), 'drv', 'mta', now() - interval '30 days', '1990-01-01', 'f');
insert into public.app_admins (user_id) values (pg_temp.uid(8));

insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4500, 'Hapoel Hadera') on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (9101, 383, 2026, 'R1', now() + interval '2 days', 'NS', 604, 4500),
  (9102, 383, 2026, 'R2', now() + interval '2 days', 'NS', 604, 4500),
  (9103, 383, 2026, 'R3', now() + interval '2 days', 'NS', 604, 4500),
  (9104, 383, 2026, 'R4', now() + interval '2 days', 'NS', 604, 4500);

-- Offers (as postgres: auth.uid() null → the ride gate is skipped; the stamp fills team/nick).
insert into public.trips (user_id, fixture_id, kind, from_city, pickup, seats) values
  (pg_temp.uid(2), 9101, 'offer', 'חיפה', 'תחנה', 3),
  (pg_temp.uid(4), 9102, 'offer', 'חיפה', 'תחנה', 3),
  (pg_temp.uid(6), 9103, 'offer', 'חיפה', 'תחנה', 3);
select set_config('t.ta', (select id::text from public.trips where fixture_id = 9101), true);
select set_config('t.tb', (select id::text from public.trips where fixture_id = 9102), true);
select set_config('t.tc', (select id::text from public.trips where fixture_id = 9103), true);
insert into public.trip_requests (user_id, trip_id) values
  (pg_temp.uid(1), current_setting('t.ta')::uuid),
  (pg_temp.uid(3), current_setting('t.tb')::uuid),
  (pg_temp.uid(5), current_setting('t.tc')::uuid);

-- Accept B and C while their matches are in the future (the driver decides).
select pg_temp.as_fan(4);
set local role authenticated;
update public.trip_requests set status = 'accepted' where trip_id = current_setting('t.tb')::uuid;
reset role;
select pg_temp.as_fan(6);
set local role authenticated;
update public.trip_requests set status = 'accepted' where trip_id = current_setting('t.tc')::uuid;
reset role;

-- ===== H1 =====
-- (a) a pending request is no shared ride, even after kickoff.
update public.fixtures set kickoff_at = now() - interval '1 hour' where id = 9101;
select pg_temp.as_fan(1);
set local role authenticated;
insert into public.reports (kind, ref, reason, note) values ('user', pg_temp.uid(2)::text, 'הטרדה או פגיעה בנסיעה', '');
reset role;
select ok(not pg_temp.suspended(2), 'H1: a pending request does not auto-suspend');

-- (b) an accepted request before kickoff is not evidence yet (9102 stays in the future).
select pg_temp.as_fan(3);
set local role authenticated;
insert into public.reports (kind, ref, reason, note) values ('user', pg_temp.uid(4)::text, 'הטרדה או פגיעה בנסיעה', '');
reset role;
select ok(not pg_temp.suspended(4), 'H1: an accepted request before kickoff does not auto-suspend');

-- (c) an accepted request on a match that kicked off suspends at once.
update public.fixtures set kickoff_at = now() - interval '1 hour' where id = 9103;
select pg_temp.as_fan(5);
set local role authenticated;
insert into public.reports (kind, ref, reason, note) values ('user', pg_temp.uid(6)::text, 'הטרדה או פגיעה בנסיעה', '');
reset role;
select ok(pg_temp.suspended(6), 'H1: an accepted request after kickoff auto-suspends');

-- (d) the linking request cannot be deleted while the driver is in an open harm case.
select pg_temp.as_fan(5);
set local role authenticated;
delete from public.trip_requests where trip_id = current_setting('t.tc')::uuid and user_id = pg_temp.uid(5);
reset role;
select is((select count(*)::int from public.trip_requests where trip_id = current_setting('t.tc')::uuid and user_id = pg_temp.uid(5)),
  1, 'H1: the rider cannot erase the linking request while the driver is in an open case');

-- ===== M3 (1) gender set once =====
select pg_temp.as_fan(7);
set local role authenticated;
select lives_ok($$ update public.profiles set gender = 'f' where user_id = auth.uid() $$, 'M3: a fan sets their gender while it is unset');
select throws_ok($$ update public.profiles set gender = 'm' where user_id = auth.uid() $$, '42501', 'gender_locked',
  'M3: a fan cannot change their gender once set');
reset role;
select pg_temp.as_fan(7);
set local role authenticated;
select throws_ok(format('select public.admin_set_gender(%L, %L)', pg_temp.uid(7), 'm'), '42501', 'not_admin',
  'M3: a non-admin cannot change a gender');
reset role;
select pg_temp.as_fan(8);
set local role authenticated;
select lives_ok(format('select public.admin_set_gender(%L, %L)', pg_temp.uid(7), 'x'), 'M3: an admin can change a gender');
reset role;
select is((select gender from public.profiles where user_id = pg_temp.uid(7)), 'x', 'M3: the admin change took effect');
select is((select count(*)::int from public.admin_actions where action = 'gender_fix' and target_user = pg_temp.uid(7)),
  1, 'M3: the admin gender change is logged');

-- ===== M3 (2) ride_female_ok, switch OFF (today) =====
select ok(private.ride_female_ok(pg_temp.uid(9)), 'M3: switch off — a female fan qualifies');
select ok(not private.ride_female_ok(pg_temp.uid(10)), 'M3: switch off — a male fan does not');

insert into public.fan_verifications (user_id, kind, status, doc_fingerprint, is_female, approved_at, expires_at) values
  (pg_temp.uid(9),  'identity', 'approved', repeat('a', 64), null,  now(), now() + interval '2 years'),
  (pg_temp.uid(10), 'identity', 'approved', repeat('b', 64), null,  now(), now() + interval '2 years'),
  (pg_temp.uid(11), 'identity', 'approved', repeat('c', 64), true,  now(), now() + interval '2 years'),
  (pg_temp.uid(12), 'identity', 'approved', repeat('d', 64), false, now(), now() + interval '2 years');

update private.app_settings set value = 'true' where key = 'rides_require_verification';
select ok(not private.ride_female_ok(pg_temp.uid(13)), 'M3: switch on — a female with no identity does not qualify');
select ok(private.ride_female_ok(pg_temp.uid(9)), 'M3: switch on — a verified female qualifies');
select ok(not private.ride_female_ok(pg_temp.uid(10)), 'M3: switch on — a verified male does not');
select ok(private.ride_female_ok(pg_temp.uid(11)), 'M3: switch on — the document-sex marker (female) qualifies');
select ok(not private.ride_female_ok(pg_temp.uid(12)), 'M3: switch on — the marker (not female) overrides a female gender');

-- Integration: a women-only offer (as postgres, offer gate skipped), switch ON.
insert into public.trips (user_id, fixture_id, kind, from_city, pickup, seats, women_only) values
  (pg_temp.uid(14), 9104, 'offer', 'חיפה', 'תחנה', 3, true);
select set_config('t.tw', (select id::text from public.trips where fixture_id = 9104), true);
select pg_temp.as_fan(13);
set local role authenticated;
select throws_ok(format('insert into public.trip_requests (trip_id) values (%L)', current_setting('t.tw')), '42501', 'women_only',
  'M3: switch on — an unverified female cannot join a women-only ride');
reset role;
select pg_temp.as_fan(9);
set local role authenticated;
select lives_ok(format('insert into public.trip_requests (trip_id) values (%L)', current_setting('t.tw')),
  'M3: switch on — a verified female can join a women-only ride');
reset role;

-- Switch OFF: today's behaviour — a female fan with no verification can still join.
update private.app_settings set value = 'false' where key = 'rides_require_verification';
select pg_temp.as_fan(13);
set local role authenticated;
select lives_ok(format('insert into public.trip_requests (trip_id) values (%L)', current_setting('t.tw')),
  'M3: switch off — a female fan joins on the self-declared gender (unchanged)');
reset role;

select * from finish();
rollback;
