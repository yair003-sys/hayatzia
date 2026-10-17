-- Push subscriptions are private to their owner.
begin;
select plan(6);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'u31@test.local'),
  ('00000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'u32@test.local');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/1', 'k', 'a') $$,
  'turn notifications on for this device');
select throws_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('http://evil/2', 'k', 'a') $$,
  '23514', null, 'only https push endpoints');
-- Security review 2026-10-17: the host allowlist is enforced in the database too, not only in schema.ts.
select throws_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://evil.example/x', 'k', 'a') $$,
  '23514', null, 'a host that is not a real push service is refused');
select throws_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com.evil.example/x', 'k', 'a') $$,
  '23514', null, 'a look-alike host is refused');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.push_subscriptions), 0, 'nobody else sees your devices');
select throws_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://fcm.googleapis.com/3', 'k', 'a', '00000000-0000-0000-0000-000000000031') $$,
  '42501', null, 'cannot subscribe someone else');
reset role;

select * from finish();
rollback;
