-- Security fixes 2026-10-17 — DMs and groups: M2 (refused requests count toward the daily cap; the refusal is
-- generic for a closed setting and a reached cap alike) and M5+L2 (daily caps on groups and invites, a re-invite
-- cooldown, and a silent skip for a block so an admin cannot learn of a block between two other fans).
-- Migration 20261017130000_security_fixes.
begin;
select plan(12);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.as_fan(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.pair(a int, b int) returns uuid language sql as $$
  select id from public.dm_threads where user_a = least(pg_temp.uid(a), pg_temp.uid(b)) and user_b = greatest(pg_temp.uid(a), pg_temp.uid(b))
$$;

insert into auth.users (id, aud, role, email)
  select pg_temp.uid(g), 'authenticated', 'authenticated', 'dm' || g || '@test.local' from generate_series(1, 28) g;

-- M2: 1 req (young, cap 5); 2,3 open; 4-7 QR-only. M5: 16 cc (cap), 17-22 teammates, 23 ci, 24 jd, 25 tm, 26 yb, 27 cz, 28 cn.
insert into public.profiles (user_id, nick, team_id, created_at, birth_date, dm_requests) values
  (pg_temp.uid(1), 'req', 'mta', now() - interval '1 day',  '1990-01-01', 'everyone'),
  (pg_temp.uid(2), 'o1',  'mta', now() - interval '30 days', '1990-01-01', 'everyone'),
  (pg_temp.uid(3), 'o2',  'mta', now() - interval '30 days', '1990-01-01', 'everyone'),
  (pg_temp.uid(4), 'q1',  'mta', now() - interval '30 days', '1990-01-01', 'qr'),
  (pg_temp.uid(5), 'q2',  'mta', now() - interval '30 days', '1990-01-01', 'qr'),
  (pg_temp.uid(6), 'q3',  'mta', now() - interval '30 days', '1990-01-01', 'qr'),
  (pg_temp.uid(7), 'q4',  'mta', now() - interval '30 days', '1990-01-01', 'qr'),
  (pg_temp.uid(8), 'gu',  'mta', now() - interval '1 day',  '1990-01-01', 'everyone'),
  (pg_temp.uid(9), 'gu2', 'mta', now() - interval '1 day',  '1990-01-01', 'everyone');
insert into public.profiles (user_id, nick, team_id, created_at, birth_date, dm_requests)
  select pg_temp.uid(g), 'e' || g, 'mta', now() - interval '30 days', '1990-01-01', 'everyone' from generate_series(10, 15) g;
insert into public.profiles (user_id, nick, team_id, created_at, birth_date)
  select pg_temp.uid(g), 'm' || g, 'mta', now() - interval '30 days', '1990-01-01' from generate_series(16, 28) g;

-- ===== M2: request_dm counts refused attempts; the refusal is generic =====
select pg_temp.as_fan(1);
set local role authenticated;
select ok((select public.request_dm(pg_temp.uid(2))) is not null, 'M2: an open target returns a thread');
select ok((select public.request_dm(pg_temp.uid(4))) is null, 'M2: a QR-only target is a generic refusal (null)');
-- Three more refused attempts fill the young account''s cap of 5 (1 real thread + 4 refused).
select public.request_dm(pg_temp.uid(5));
select public.request_dm(pg_temp.uid(6));
select public.request_dm(pg_temp.uid(7));
select ok((select public.request_dm(pg_temp.uid(3))) is null,
  'M2: an OPEN target is now refused too — refused attempts counted toward the cap (same generic answer)');
reset role;
select is((select count(*)::int from private.dm_request_attempts where opener = pg_temp.uid(1)), 5,
  'M2: every refused attempt was recorded against the requester');

-- The gate (direct insert) refuses with the SAME code for a closed setting and a reached cap.
select pg_temp.as_fan(8);
set local role authenticated;
select lives_ok($$ do $d$ begin
  for i in 10..14 loop
    insert into public.dm_threads (user_a, user_b) values (least(auth.uid(), pg_temp.uid(i)), greatest(auth.uid(), pg_temp.uid(i)));
  end loop;
end $d$ $$, 'M2: a young account opens its 5 allowed requests');
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)',
  least(pg_temp.uid(8), pg_temp.uid(15)), greatest(pg_temp.uid(8), pg_temp.uid(15))),
  'P0001', 'requests_blocked', 'M2: the 6th (cap reached) is the generic requests_blocked');
reset role;
select pg_temp.as_fan(9);
set local role authenticated;
select throws_ok(format('insert into public.dm_threads (user_a, user_b) values (%L, %L)',
  least(pg_temp.uid(9), pg_temp.uid(4)), greatest(pg_temp.uid(9), pg_temp.uid(4))),
  'P0001', 'requests_blocked', 'M2: a closed setting is the SAME generic requests_blocked');
reset role;

-- ===== M5: group / invite caps and cooldown =====
-- cc opens 5 groups (the daily limit), each inviting one teammate; the 6th is refused.
select pg_temp.as_fan(16);
set local role authenticated;
select lives_ok($$ do $d$ begin
  for i in 17..21 loop
    perform public.create_group('קבוצה ' || i, array[pg_temp.uid(i)]);
  end loop;
end $d$ $$, 'M5: a fan opens 5 groups in a day');
select throws_ok(format('select public.create_group(%L, array[%L]::uuid[])', 'עוד אחת', pg_temp.uid(22)),
  'P0001', 'group_limit', 'M5: the 6th new group in a day is refused');
reset role;

-- Cooldown: an invitee who declined is not re-invited for 24 hours (silently skipped).
select pg_temp.as_fan(23);
set local role authenticated;
select set_config('t.g', public.create_group('בדיקה', array[pg_temp.uid(24)])::text, true);
reset role;
select pg_temp.as_fan(24);
set local role authenticated;
select public.answer_invite(current_setting('t.g')::uuid, false);  -- jd declines
reset role;
select pg_temp.as_fan(23);
set local role authenticated;
select is(public.invite_to_group(current_setting('t.g')::uuid, array[pg_temp.uid(24)]), '{}'::uuid[],
  'M5: a fan who declined is on cooldown and is silently skipped on re-invite');
reset role;

-- L2: a fan with a block to a member is silently skipped (no tell-tale error).
select pg_temp.as_fan(23);
set local role authenticated;
select public.invite_to_group(current_setting('t.g')::uuid, array[pg_temp.uid(25)]);  -- invite tm
reset role;
select pg_temp.as_fan(25);
set local role authenticated;
select public.answer_invite(current_setting('t.g')::uuid, true);  -- tm joins
reset role;
insert into public.blocks (user_id, blocked_id) values (pg_temp.uid(26), pg_temp.uid(25));  -- yb blocks tm
select pg_temp.as_fan(23);
set local role authenticated;
select is(public.invite_to_group(current_setting('t.g')::uuid, array[pg_temp.uid(26)]), '{}'::uuid[],
  'L2: a fan with a block to a member is silently skipped, not refused with a tell-tale error');
reset role;

-- Invite cap: 30 invites a day. Pre-seed 30, then one more is refused.
select pg_temp.as_fan(27);
set local role authenticated;
select set_config('t.gz', public.create_group('מזמינה', array[pg_temp.uid(17)])::text, true);
reset role;
insert into private.group_rate (actor, kind) select pg_temp.uid(27), 'invite' from generate_series(1, 30);
select pg_temp.as_fan(27);
set local role authenticated;
select throws_ok(format('select public.invite_to_group(%L, array[%L]::uuid[])', current_setting('t.gz'), pg_temp.uid(28)),
  'P0001', 'invite_limit', 'M5: more than 30 invites in a day is refused');
reset role;

select * from finish();
rollback;
