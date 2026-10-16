-- Private messages (ciphertext only, members only, same club, blocks) and reports.
begin;
select plan(17);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'u11@test.local'),
  ('00000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'u12@test.local'),
  ('00000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'u13@test.local'),
  ('00000000-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'u14@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-000000000011', 'אלף', 'mta'),
  ('00000000-0000-0000-0000-000000000012', 'בית', 'mta'),
  ('00000000-0000-0000-0000-000000000013', 'גימל', 'mta'),
  ('00000000-0000-0000-0000-000000000014', 'דלת', 'hta');
-- League DMs (20261016100000): opening a thread needs a birth date; 11 and 14 take requests from their own club only.
update public.profiles set birth_date = '1990-01-01';
update public.profiles set dm_requests = 'team'
 where user_id in ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000014');

-- Fan 11 publishes a device key and opens a thread with 12.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.device_keys (device_id, public_jwk) values ('dev11aa', '{"kty":"EC"}') $$, 'publish a device public key');
select lives_ok($$ insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012') $$,
  'open a thread with a fan of the same club');
select throws_ok($$ insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000014') $$,
  '42501', 'requests_closed', 'no thread with a fan of another club who takes requests from their club only');
select throws_ok($$ insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013') $$,
  '42501', null, 'cannot open a thread between two other fans');
select lives_ok($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  select id, 'dev11aa', 'aXY=', 'Y2lwaGVy', '{"dev11aa":{"i":"x","w":"y"}}' from public.dm_threads $$, 'send an encrypted message');
select throws_ok($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys, sender_id)
  select id, 'dev11aa', 'aXY=', 'eA==', '{}', '00000000-0000-0000-0000-000000000012' from public.dm_threads $$,
  '42501', null, 'cannot send as someone else');
select is((select last_from from public.dm_threads), '00000000-0000-0000-0000-000000000011'::uuid, 'thread shows who wrote last');
reset role;

-- No plaintext column exists anywhere in the messages table.
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'dm_messages'
  and column_name in ('body', 'text', 'plaintext', 'content')), 0, 'messages table has no plaintext column');

-- Fan 13 (same club, not a member) sees nothing; fan 14 (other club) cannot read keys.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.dm_messages), 0, 'outsiders cannot read the messages');
select is((select count(*)::int from public.dm_threads), 0, 'outsiders cannot see the thread');
select is((select count(*)::int from public.device_keys), 1, 'teammates can fetch public keys to write to you');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.device_keys), 0, 'other clubs cannot fetch your keys when you take requests from your club only');
reset role;

-- Fan 12 blocks 11: no more messages either way.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.dm_messages), 1, 'the other member reads the ciphertext');
select lives_ok($$ insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-000000000011') $$, 'block a fan');
select throws_ok($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  select id, 'dev12bb', 'aXY=', 'eA==', '{}' from public.dm_threads $$, '42501', 'blocked', 'no messages after a block');
-- Reports: can file, cannot read.
select lives_ok($$ insert into public.reports (kind, ref, reason) values ('dm_thread', 'x', 'הטרדה') $$, 'file a report');
reset role;
set local role authenticated;
select throws_ok($$ select * from public.reports $$, '42501', null, 'fans cannot read reports');
reset role;

select * from finish();
rollback;
