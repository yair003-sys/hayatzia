-- League-wide private messages (migration 20261016100000_league_dms; spec docs/superpowers/specs/2026-10-16-league-dms-design.md):
-- 1. profile: birth date (set once, 16+, private), request setting, QR code; rides read 18+ from the birth date.
-- 2. threads: open across clubs, one message before acceptance, replying accepts, request settings, daily caps,
--    bans, blocks, device keys only when allowed.
-- 3. QR: opening by code (accepted, outside the setting and the cap), reset, blocks; the most-blocked list for admins.
begin;
select plan(85);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-000000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.pair(a text, b text) returns uuid language sql as $$
  select t.id from public.dm_threads t
   where (t.user_a, t.user_b) = (least(pg_temp.uid(a), pg_temp.uid(b)), greatest(pg_temp.uid(a), pg_temp.uid(b)))
$$;
-- QR codes are not readable by fans: section 3 reads them from a snapshot taken by postgres.
create temp table qr_codes (user_id uuid primary key, qr_code text);
grant select on qr_codes to authenticated;
create function pg_temp.code(p text) returns text language sql as $$
  select qr_code from pg_temp.qr_codes where user_id = pg_temp.uid(p)
$$;

-- d01 adult mta · d02 adult hta · d03 17-year-old hta · d04 no birth date yet (sets it below) · d05 adult, 2-day-old account
-- d06 adult hta (requests only by QR) · d07 adult, banned · d08 admin · d09 adult who opens many threads · d10 never gives a birth date
-- d11 / d12 sign up inside the test · e01..e25 adults of hta (targets).
insert into auth.users (id, aud, role, email)
  select pg_temp.uid('d' || lpad(g::text, 2, '0')), 'authenticated', 'authenticated', 'd' || g || '@test.local' from generate_series(1, 12) g;
insert into auth.users (id, aud, role, email)
  select pg_temp.uid('e' || lpad(g::text, 2, '0')), 'authenticated', 'authenticated', 'e' || g || '@test.local' from generate_series(1, 25) g;
-- Inserted as postgres, so created_at is kept as given.
insert into public.profiles (user_id, nick, team_id, created_at, birth_date) values
  (pg_temp.uid('d01'), 'אלף', 'mta', now() - interval '30 days', '1990-01-01'),
  (pg_temp.uid('d02'), 'בית', 'hta', now() - interval '30 days', '1985-06-15'),
  (pg_temp.uid('d03'), 'גימל', 'hta', now() - interval '30 days', (current_date - interval '17 years')::date),
  (pg_temp.uid('d04'), 'דלת', 'mta', now() - interval '30 days', null),
  (pg_temp.uid('d05'), 'הא', 'mta', now() - interval '2 days', '1995-03-03'),
  (pg_temp.uid('d06'), 'וו', 'hta', now() - interval '30 days', '1992-02-02'),
  (pg_temp.uid('d07'), 'זין', 'mta', now() - interval '30 days', '1991-01-01'),
  (pg_temp.uid('d08'), 'מנהל', 'mta', now() - interval '30 days', '1980-01-01'),
  (pg_temp.uid('d09'), 'פותח', 'mta', now() - interval '30 days', '1993-01-01'),
  (pg_temp.uid('d10'), 'בלי', 'mta', now() - interval '30 days', null);
insert into public.profiles (user_id, nick, team_id, created_at, birth_date)
  select pg_temp.uid('e' || lpad(g::text, 2, '0')), 'יעד' || g, 'hta', now() - interval '30 days', '1990-01-01' from generate_series(1, 25) g;
insert into public.app_admins (user_id) values (pg_temp.uid('d08'));
insert into public.fan_bans (user_id, reason) values (pg_temp.uid('d07'), 'בדיקה');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4500, 'Hapoel Hadera') on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id)
  values (95, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4500);

-- ===================== 1. profile: birth date, request setting, QR code =====================
select pg_temp.as_fan('d04');
set local role authenticated;
select throws_ok(format('select public.set_birth_date(%L)', (current_date - interval '15 years')::date), '22023', 'too_young',
  'under 16 is refused');
select throws_ok(format('select public.set_birth_date(%L)', current_date + 1), '22023', 'bad_date', 'a date in the future is refused');
select throws_ok($$ select public.set_birth_date('1899-12-31') $$, '22023', 'bad_date', 'a date before 1900 is refused');
select lives_ok($$ select public.set_birth_date('1990-05-01') $$, 'a fan sets their birth date');
select throws_ok($$ select public.set_birth_date('1991-05-01') $$, 'P0001', 'already_set', 'the birth date is set once');
select results_eq($$ select birth_date, dm_requests from public.my_private_profile() $$,
  $$ values ('1990-05-01'::date, 'everyone'::text) $$, 'the fan reads their own birth date and setting');
select ok((select qr_code ~ '^[A-Za-z0-9_-]{22,}$' from public.my_private_profile()), 'the fan reads their own QR code');
reset role;

select pg_temp.as_fan('d01');
set local role authenticated;
select throws_ok($$ select birth_date from public.profiles $$, '42501', null, 'birth dates are not readable');
select throws_ok($$ select qr_code from public.profiles $$, '42501', null, 'QR codes are not readable');
select throws_ok($$ select dm_requests from public.profiles $$, '42501', null, 'request settings are not readable');
select throws_ok($$ update public.profiles set birth_date = '1970-01-01' where user_id = auth.uid() $$, '42501', null,
  'the birth date is not updatable directly');
select throws_ok($$ update public.profiles set qr_code = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA' where user_id = auth.uid() $$, '42501', null,
  'the QR code is not updatable directly');
select throws_ok($$ select public.set_dm_requests('friends') $$, '22023', 'bad_value', 'only the three settings exist');
reset role;

select is(private.dm_setting(pg_temp.uid('d01')), 'everyone', 'an adult with no setting gets requests from everyone');
select is(private.dm_setting(pg_temp.uid('d03')), 'team', 'a 17-year-old with no setting gets requests from their club only');
select is(private.dm_setting(pg_temp.uid('d10')), 'team', 'a fan with no birth date counts as a minor');
select ok(private.is_adult(pg_temp.uid('d01')) and not private.is_adult(pg_temp.uid('d03')) and not private.is_adult(pg_temp.uid('d10')),
  'adulthood comes from the birth date');
select is((select count(*)::int from public.profiles where qr_code is null or qr_code !~ '^[A-Za-z0-9_-]{22,}$'), 0,
  'every profile has a QR code');
select is((select count(distinct qr_code)::int from public.profiles), (select count(*)::int from public.profiles), 'QR codes are unique');

-- Sign-up: the birth date comes with the profile; the QR code is the database's, never the fan's.
select pg_temp.as_fan('d11');
set local role authenticated;
select lives_ok($$ insert into public.profiles (user_id, nick, team_id, terms_version, birth_date, qr_code)
  values (auth.uid(), 'חדש', 'mta', '2026-10-15', '2000-01-01', 'CHOSEN_BY_THE_FAN_AAAAAAAA') $$, 'sign up with a birth date');
select ok((select qr_code <> 'CHOSEN_BY_THE_FAN_AAAAAAAA' and birth_date = '2000-01-01' from public.my_private_profile()),
  'the QR code is stamped by the database');
reset role;
select pg_temp.as_fan('d12');
set local role authenticated;
select throws_ok(format($$ insert into public.profiles (user_id, nick, team_id, terms_version, birth_date)
  values (auth.uid(), 'צעיר', 'mta', '2026-10-15', %L) $$, (current_date - interval '16 years' + interval '1 day')::date),
  '22023', 'too_young', 'a fan one day short of 16 cannot sign up');
reset role;

-- Reset: a new code, the old one gone.
select set_config('t.old06', (select qr_code from public.profiles where user_id = pg_temp.uid('d06')), true);
select pg_temp.as_fan('d06');
set local role authenticated;
select ok((select public.reset_qr_code() is distinct from current_setting('t.old06')), 'reset returns a new code');
select lives_ok($$ select public.set_dm_requests('qr') $$, 'a fan takes requests only by QR');
reset role;
select ok((select qr_code <> current_setting('t.old06') and char_length(qr_code) >= 22 from public.profiles where user_id = pg_temp.uid('d06')),
  'the stored code changed');
select is(private.dm_setting(pg_temp.uid('d06')), 'qr', 'the chosen setting wins over the age default');

-- Rides read 18+ from the birth date.
select pg_temp.as_fan('d10');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (95, 'offer', 'חיפה', 'תחנה', 2) $$,
  '42501', 'no_birth_date', 'no birth date, no rides');
update public.profiles set adult_confirmed_at = now() where user_id = auth.uid();
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (95, 'offer', 'חיפה', 'תחנה', 2) $$,
  '42501', 'no_birth_date', 'the old 18+ tap no longer opens rides');
reset role;
select pg_temp.as_fan('d03');
set local role authenticated;
select throws_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (95, 'offer', 'חיפה', 'תחנה', 2) $$,
  '42501', 'not_adult', 'a 17-year-old cannot offer a ride');
reset role;
select pg_temp.as_fan('d01');
set local role authenticated;
select lives_ok($$ insert into public.trips (fixture_id, kind, from_city, pickup, seats) values (95, 'offer', 'חיפה', 'תחנה', 2) $$,
  'an adult by birth date offers a ride without the 18+ tap');
select is((select adult_confirmed from public.my_ride_profile()), true, 'the ride profile says 18+ from the birth date');
reset role;

-- ===================== 2. threads =====================
select pg_temp.as_fan('d01');
set local role authenticated;
insert into public.device_keys (device_id, public_jwk) values ('devd01', '{"kty":"EC"}');
select lives_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d01'), pg_temp.uid('d02')),
  greatest(pg_temp.uid('d01'), pg_temp.uid('d02'))), 'a fan opens a thread with a fan of another club');
reset role;
select ok((select accepted_at is null and opened_by = pg_temp.uid('d01') and not via_qr from public.dm_threads where id = pg_temp.pair('d01', 'd02')),
  'the new thread is a request opened by the fan');
select pg_temp.as_fan('d01');
set local role authenticated;
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'devd01', 'aXY=', 'eA==', '{}') $$, pg_temp.pair('d01', 'd02')), 'the first message is sent');
select throws_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'devd01', 'aXY=', 'eQ==', '{}') $$, pg_temp.pair('d01', 'd02')), 'P0001', 'awaiting_accept',
  'a second message before acceptance is refused');
select throws_ok(format('select public.accept_dm_thread(%L)', pg_temp.pair('d01', 'd02')), '42501', 'not_allowed',
  'the opener cannot accept their own request');
reset role;
select is((select count(*)::int from public.dm_messages where thread_id = pg_temp.pair('d01', 'd02')), 1, 'exactly one message landed');

select pg_temp.as_fan('d02');
set local role authenticated;
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('d01')), 1,
  'the recipient reads the opener''s device keys (a thread exists)');
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'devd02', 'aXY=', 'eg==', '{}') $$, pg_temp.pair('d01', 'd02')), 'the recipient replies');
reset role;
select ok((select accepted_at is not null from public.dm_threads where id = pg_temp.pair('d01', 'd02')), 'replying accepts the request');
select pg_temp.as_fan('d01');
set local role authenticated;
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'devd01', 'aXY=', 'ew==', '{}') $$, pg_temp.pair('d01', 'd02')), 'after acceptance the opener writes freely');
reset role;

-- Accepting with the button.
select pg_temp.as_fan('d04');
set local role authenticated;
insert into public.dm_threads (user_a, user_b) values (least(pg_temp.uid('d04'), pg_temp.uid('e01')), greatest(pg_temp.uid('d04'), pg_temp.uid('e01')));
reset role;
select pg_temp.as_fan('e01');
set local role authenticated;
select lives_ok(format('select public.accept_dm_thread(%L)', pg_temp.pair('d04', 'e01')), 'the recipient accepts');
reset role;
select ok((select accepted_at is not null from public.dm_threads where id = pg_temp.pair('d04', 'e01')), 'accept stamps the thread');
select pg_temp.as_fan('d02');
set local role authenticated;
select throws_ok(format('select public.accept_dm_thread(%L)', pg_temp.pair('d04', 'e01')), 'P0001', 'not_member',
  'an outsider cannot accept');
reset role;

-- Request settings.
select pg_temp.as_fan('d01');
set local role authenticated;
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d01'), pg_temp.uid('d03')),
  greatest(pg_temp.uid('d01'), pg_temp.uid('d03'))), '42501', 'requests_closed', 'a minor gets no requests from other clubs');
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d01'), pg_temp.uid('d06')),
  greatest(pg_temp.uid('d01'), pg_temp.uid('d06'))), '42501', 'requests_closed', 'a QR-only fan gets no requests');
reset role;
select pg_temp.as_fan('d02');
set local role authenticated;
select lives_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d02'), pg_temp.uid('d03')),
  greatest(pg_temp.uid('d02'), pg_temp.uid('d03'))), 'a minor gets requests from their own club');
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d02'), pg_temp.uid('d06')),
  greatest(pg_temp.uid('d02'), pg_temp.uid('d06'))), '42501', 'requests_closed', 'QR-only means even the same club');
reset role;

-- Who may open at all.
select pg_temp.as_fan('d10');
set local role authenticated;
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d10'), pg_temp.uid('d01')),
  greatest(pg_temp.uid('d10'), pg_temp.uid('d01'))), '42501', 'no_birth_date', 'no birth date, no new threads');
reset role;
select pg_temp.as_fan('d07');
set local role authenticated;
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d07'), pg_temp.uid('d01')),
  greatest(pg_temp.uid('d07'), pg_temp.uid('d01'))), '42501', 'banned', 'a banned fan cannot open threads');
reset role;
-- e02 blocks d01 (the "חסום" button on a request).
insert into public.blocks (user_id, blocked_id) values (pg_temp.uid('e02'), pg_temp.uid('d01'));
select pg_temp.as_fan('d01');
set local role authenticated;
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d01'), pg_temp.uid('e02')),
  greatest(pg_temp.uid('d01'), pg_temp.uid('e02'))), '42501', 'blocked', 'no thread with a fan who blocked you');
reset role;

-- Caps: 20 new requests a day; 5 for an account younger than 3 days.
select pg_temp.as_fan('d09');
set local role authenticated;
select lives_ok($$ do $d$ begin
  for i in 1..20 loop
    insert into public.dm_threads (user_a, user_b)
      select least(auth.uid(), pg_temp.uid('e' || lpad(i::text, 2, '0'))), greatest(auth.uid(), pg_temp.uid('e' || lpad(i::text, 2, '0')))
       where i <> 2;
  end loop;
  insert into public.dm_threads (user_a, user_b) values (least(auth.uid(), pg_temp.uid('e21')), greatest(auth.uid(), pg_temp.uid('e21')));
end $d$ $$, '20 requests in a day');
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d09'), pg_temp.uid('e22')),
  greatest(pg_temp.uid('d09'), pg_temp.uid('e22'))), 'P0001', 'rate_limit', 'the 21st request in a day is refused');
reset role;
select pg_temp.as_fan('d05');
set local role authenticated;
select lives_ok($$ do $d$ begin
  for i in 1..5 loop
    insert into public.dm_threads (user_a, user_b)
      select least(auth.uid(), pg_temp.uid('e' || lpad(i::text, 2, '0'))), greatest(auth.uid(), pg_temp.uid('e' || lpad(i::text, 2, '0')))
       where i <> 2;
  end loop;
  insert into public.dm_threads (user_a, user_b) values (least(auth.uid(), pg_temp.uid('e06')), greatest(auth.uid(), pg_temp.uid('e06')));
end $d$ $$, 'a new account sends 5 requests');
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d05'), pg_temp.uid('e07')),
  greatest(pg_temp.uid('d05'), pg_temp.uid('e07'))), 'P0001', 'rate_limit', 'the 6th request of a new account is refused');
reset role;

-- Both sides write first at the same moment: one thread (unique pair), and the other side's message is a reply.
select pg_temp.as_fan('e03');
set local role authenticated;
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)', least(pg_temp.uid('d09'), pg_temp.uid('e03')),
  greatest(pg_temp.uid('d09'), pg_temp.uid('e03'))), '23505', null, 'the second opener gets the existing thread, not a new one');
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'deve03', 'aXY=', 'eA==', '{}') $$, pg_temp.pair('d09', 'e03')), 'they write in it');
reset role;
select ok((select accepted_at is not null from public.dm_threads where id = pg_temp.pair('d09', 'e03')),
  'writing in a thread the other side opened accepts it');

-- Device keys: only when a thread exists, the setting allows, or a group is shared.
select pg_temp.as_fan('d06');
set local role authenticated;
insert into public.device_keys (device_id, public_jwk) values ('devd06', '{"kty":"EC"}');
reset role;
select pg_temp.as_fan('e02');
set local role authenticated;
insert into public.device_keys (device_id, public_jwk) values ('deve02', '{"kty":"EC"}');
reset role;
select pg_temp.as_fan('d01');
set local role authenticated;
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('d06')), 0,
  'no keys of a fan whose setting refuses me');
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('e02')), 0, 'no keys of a fan who blocked me');
reset role;
select pg_temp.as_fan('e04');
set local role authenticated;
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('d01')), 1,
  'keys of a fan who takes requests from everyone (I may write to them)');
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('d06')), 0, 'same club, QR-only: no keys');
reset role;
insert into public.dm_groups (id, team_id, name, created_by) values ('00000000-0000-0000-0000-00000000aa01', 'hta', 'קבוצה', pg_temp.uid('e04'));
insert into public.dm_group_members (group_id, user_id, role, invited_by, joined_at) values
  ('00000000-0000-0000-0000-00000000aa01', pg_temp.uid('e04'), 'admin', pg_temp.uid('e04'), now()),
  ('00000000-0000-0000-0000-00000000aa01', pg_temp.uid('d06'), 'member', pg_temp.uid('e04'), now());
select pg_temp.as_fan('e04');
set local role authenticated;
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('d06')), 1, 'group members read each other''s keys');
-- Groups stay same-club.
select throws_ok(format('select public.invite_to_group(%L, array[%L]::uuid[])', '00000000-0000-0000-0000-00000000aa01', pg_temp.uid('d01')),
  'P0001', 'not_same_team', 'groups stay within one club');
reset role;

-- ===================== 3. QR code and the most-blocked list =====================
insert into pg_temp.qr_codes select user_id, qr_code from public.profiles;
-- d09 is over the cap; d06 takes requests only by QR: scanning still opens an accepted thread.
select pg_temp.as_fan('d09');
set local role authenticated;
select set_config('t.qr', public.open_dm_by_code(pg_temp.code('d06'))::text, true);
select is(current_setting('t.qr')::uuid, pg_temp.pair('d09', 'd06'), 'scanning opens the thread with that fan');
select ok((select accepted_at is not null and via_qr from public.dm_threads where id = pg_temp.pair('d09', 'd06')),
  'a thread opened by QR starts accepted');
select is(public.open_dm_by_code(pg_temp.code('d06')), current_setting('t.qr')::uuid, 'scanning again returns the same thread');
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'devd09', 'aXY=', 'eA==', '{}') $$, pg_temp.pair('d09', 'd06')), 'the scanner writes');
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (%L, 'devd09', 'aXY=', 'eQ==', '{}') $$, pg_temp.pair('d09', 'd06')), 'and writes again (no request step)');
select is((select count(*)::int from public.device_keys where user_id = pg_temp.uid('d06')), 1, 'and reads the keys to encrypt');
select results_eq(format('select nick::text, team_id::text from public.qr_card(%L)', pg_temp.code('d06')),
  $$ values ('וו'::text, 'hta'::text) $$, 'the add page shows the fan''s card');
select throws_ok(format('select public.open_dm_by_code(%L)', current_setting('t.old06')), 'P0002', 'bad_code',
  'a code from before the reset opens nothing');
select throws_ok(format('select * from public.qr_card(%L)', current_setting('t.old06')), 'P0002', 'bad_code',
  'nor shows a card');
select throws_ok(format('select public.open_dm_by_code(%L)', pg_temp.code('d09')), '22023', 'self', 'own code');
reset role;

-- Blocks either way, bans and a missing birth date stop the QR too.
select set_config('t.threads', (select count(*)::text from public.dm_threads), true);
select pg_temp.as_fan('d01');
set local role authenticated;
select throws_ok(format('select public.open_dm_by_code(%L)', pg_temp.code('e02')), '42501', 'blocked', 'a blocked fan scans the code of the blocker');
reset role;
select pg_temp.as_fan('e02');
set local role authenticated;
select throws_ok(format('select public.open_dm_by_code(%L)', pg_temp.code('d01')), '42501', 'blocked', 'the blocker scans the blocked fan''s code');
reset role;
select pg_temp.as_fan('d07');
set local role authenticated;
select throws_ok(format('select public.open_dm_by_code(%L)', pg_temp.code('d02')), '42501', 'banned', 'a banned fan cannot open by QR');
reset role;
select pg_temp.as_fan('d10');
set local role authenticated;
select throws_ok(format('select public.open_dm_by_code(%L)', pg_temp.code('d02')), '42501', 'no_birth_date', 'QR needs a birth date too');
reset role;
select is((select count(*)::text from public.dm_threads), current_setting('t.threads'), 'no thread was created by the refused scans');

-- A pending request becomes accepted when the recipient's code is scanned.
select pg_temp.as_fan('d02');
set local role authenticated;
select is(public.open_dm_by_code(pg_temp.code('d03')), pg_temp.pair('d02', 'd03'), 'scanning returns the existing request');
reset role;
select ok((select accepted_at is not null from public.dm_threads where id = pg_temp.pair('d02', 'd03')), 'and accepts it');

-- The most-blocked list (no content, counts only).
insert into public.blocks (user_id, blocked_id) values
  (pg_temp.uid('e10'), pg_temp.uid('d09')), (pg_temp.uid('e11'), pg_temp.uid('d09')), (pg_temp.uid('e12'), pg_temp.uid('d09'));
insert into public.blocks (user_id, blocked_id, created_at) values (pg_temp.uid('e13'), pg_temp.uid('d09'), now() - interval '40 days');
select pg_temp.as_fan('d08');
set local role authenticated;
select results_eq($$ select user_id, nick::text, blocked_by from public.admin_most_blocked(1) $$,
  format($$ values (%L::uuid, 'פותח'::text, 3) $$, pg_temp.uid('d09')), 'an admin sees who many fans blocked in the last 30 days');
reset role;
select pg_temp.as_fan('d01');
set local role authenticated;
select throws_ok($$ select * from public.admin_most_blocked(10) $$, '42501', 'not_admin', 'fans cannot read the list');
reset role;

-- Logged-out visitors run none of the new functions; fans cannot run the private helpers directly.
select ok(not has_function_privilege('anon', 'public.open_dm_by_code(text)', 'execute')
      and not has_function_privilege('anon', 'public.qr_card(text)', 'execute')
      and not has_function_privilege('anon', 'public.set_birth_date(date)', 'execute')
      and not has_function_privilege('anon', 'public.accept_dm_thread(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.admin_most_blocked(integer)', 'execute'),
  'the new functions are closed to logged-out visitors');
select ok(not has_function_privilege('authenticated', 'private.dm_setting(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.is_adult(uuid)', 'execute'),
  'the private helpers are closed to fans');

select * from finish();
rollback;
