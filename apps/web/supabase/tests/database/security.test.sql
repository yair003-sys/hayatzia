-- Security review 2026-10-15 (migration 20261015090000_security_hardening): notification abuse, forged join date,
-- anonymous profiles, block probing, functions open to logged-out visitors, view-once files, key size, seats race.
begin;
select plan(21);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000a61', 'authenticated', 'authenticated', 'a61@test.local'),
  ('00000000-0000-0000-0000-000000000a62', 'authenticated', 'authenticated', 'a62@test.local'),
  ('00000000-0000-0000-0000-000000000a63', 'authenticated', 'authenticated', 'a63@test.local'),
  ('00000000-0000-0000-0000-000000000a64', 'authenticated', 'authenticated', 'a64@test.local'),
  ('00000000-0000-0000-0000-000000000a65', 'authenticated', 'authenticated', 'a65@test.local'),
  ('00000000-0000-0000-0000-000000000a66', 'authenticated', 'authenticated', 'a66@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-000000000a61', 'שולח', 'mta'),
  ('00000000-0000-0000-0000-000000000a62', 'מקבל', 'mta'),
  ('00000000-0000-0000-0000-000000000a63', 'זר', 'mta'),
  ('00000000-0000-0000-0000-000000000a64', 'חוסם', 'mta');
-- League DMs (20261016100000): opening a private thread needs a birth date.
update public.profiles set birth_date = '1990-01-01';

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;

-- ---------- 1. message notifications ----------
select pg_temp.as_fan('a61');
set local role authenticated;
insert into public.device_keys (device_id, public_jwk) values ('deva61', '{"kty":"EC"}');
insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000a61', '00000000-0000-0000-0000-000000000a62');
select set_config('t.th', (select id::text from public.dm_threads), true);
select is(public.claim_message_push('dm', current_setting('t.th')::uuid), false, 'no notification without a real message');
insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.th')::uuid, 'deva61', 'aXY=', 'Y2lwaGVy', '{"deva61":{"i":"x","w":"y"}}');
select is(public.claim_message_push('dm', current_setting('t.th')::uuid), true, 'a fresh message is notified');
select is(public.claim_message_push('dm', current_setting('t.th')::uuid), false, 'not again within 10 seconds');
select is(public.claim_message_push('nope', current_setting('t.th')::uuid), false, 'unknown kind is refused');
select is(public.claim_message_push('grp', gen_random_uuid()), false, 'no group message, no notification');
reset role;

select pg_temp.as_fan('a63');
set local role authenticated;
select is(public.claim_message_push('dm', current_setting('t.th')::uuid), false, 'an outsider cannot notify a thread');
reset role;

-- After a block, even a fresh message notifies nobody.
insert into public.blocks (user_id, blocked_id) values ('00000000-0000-0000-0000-000000000a62', '00000000-0000-0000-0000-000000000a61');
update public.push_throttle set at = now() - interval '1 minute';
select pg_temp.as_fan('a61');
set local role authenticated;
select is(public.claim_message_push('dm', current_setting('t.th')::uuid), false, 'no notification across a block');
select throws_ok($$ select count(*) from public.push_throttle $$, '42501', null, 'the throttle table is closed to fans');
reset role;

-- ---------- 2 + 3. profiles ----------
select pg_temp.as_fan('a65');
set local role authenticated;
insert into public.profiles (user_id, nick, team_id, created_at, terms_version, birth_date)
  values ('00000000-0000-0000-0000-000000000a65', 'מזייף', 'mta', '2000-01-01T00:00:00Z', '2026-10-15', '1990-01-01');
select ok((select created_at > now() - interval '1 minute' from public.profiles where user_id = auth.uid()),
  'the join date is stamped by the database, not the fan');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000a66","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;
select throws_ok($$ insert into public.profiles (user_id, nick, team_id, terms_version) values ('00000000-0000-0000-0000-000000000a66', 'אנונימי', 'mta', '2026-10-15') $$,
  '42501', null, 'an anonymous sign-in cannot create a fan profile');
reset role;

-- ---------- 4. blocked_between ----------
select pg_temp.as_fan('a63');
set local role authenticated;
select is(public.blocked_between('00000000-0000-0000-0000-000000000a61', '00000000-0000-0000-0000-000000000a62'), false,
  'a fan cannot learn whether two other fans blocked each other');
reset role;
select pg_temp.as_fan('a61');
set local role authenticated;
select is(public.blocked_between('00000000-0000-0000-0000-000000000a61', '00000000-0000-0000-0000-000000000a62'), true,
  'a fan learns about blocks that involve them');
reset role;
select is(public.blocked_between('00000000-0000-0000-0000-000000000a61', '00000000-0000-0000-0000-000000000a62'), true,
  'the database itself sees every block');

-- ---------- 5. logged-out visitors ----------
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  array['club_of_api'], 'logged-out visitors can run only the public club lookup');
select ok(has_function_privilege('authenticated', 'public.my_team()', 'execute'), 'signed-in fans still run my_team');
select ok(not has_function_privilege('anon', 'private.blocks_exist(uuid, uuid)', 'execute'), 'the private block check is closed to anon');

-- ---------- 6. view-once files ----------
select pg_temp.as_fan('a61');
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-000000000a61/open.jpg', 'image');
insert into public.clips (media_path, kind, once) values ('00000000-0000-0000-0000-000000000a61/once.jpg', 'image', true);
reset role;
insert into storage.objects (bucket_id, name, owner) values
  ('clips', '00000000-0000-0000-0000-000000000a61/open.jpg', '00000000-0000-0000-0000-000000000a61'),
  ('clips', '00000000-0000-0000-0000-000000000a61/once.jpg', '00000000-0000-0000-0000-000000000a61');
select pg_temp.as_fan('a63');
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'clips' and name like '%/open.jpg'), 1,
  'a fan reads an ordinary post file');
select is((select count(*)::int from storage.objects where bucket_id = 'clips' and name like '%/once.jpg'), 0,
  'a view-once file is never readable directly');
reset role;
select pg_temp.as_fan('a61');
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'clips' and name like '%/once.jpg'), 1,
  'the poster still reads their own view-once file');
reset role;

-- ---------- 7. key size ----------
select ok(exists (select 1 from pg_constraint where conname = 'dm_messages_wrapped_keys_size'), 'private-message keys have a size cap');

-- ---------- 9. subscriptions per fan ----------
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
  select '00000000-0000-0000-0000-000000000a63', 'https://push.example/cap' || g, 'k', 'a', now() - make_interval(secs => 20 - g)
  from generate_series(1, 14) g;
select is((select count(*)::int from public.push_subscriptions where user_id = '00000000-0000-0000-0000-000000000a63'), 10,
  'a fan keeps at most 10 notification subscriptions');

select * from finish();
rollback;
