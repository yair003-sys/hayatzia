-- Channel unread marker + push-recipients resolver (2026-11-01).
begin;
select plan(5);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'cpush_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'cpush_sub@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cpush_other@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'אדמין', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'אוהד', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'אחר', 'hta');
insert into public.team_channel_admins (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000a1');
-- a2 has a push subscription; the admin does not.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000a2', 'https://fcm.googleapis.com/fcm/send/cpush-a2', 'k', 'a');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('עדכון חדש');
reset role;

-- a same-club fan who never opened the tab has unread; after marking seen, they do not.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select is(public.channel_unread(), true, 'a fan who never opened the news tab has unread');
select public.channel_mark_seen();
select is(public.channel_unread(), false, 'after marking seen there is no unread');
reset role;

-- a fan of a club with no posts has no unread.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is(public.channel_unread(), false, 'a fan of a club with no posts has no unread');
reset role;

-- the push-recipients resolver returns exactly the club fans that have a subscription.
select results_eq(
  $$ select public.channel_post_recipients('mta', null, 100) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'push recipients = club fans with a subscription');

-- the resolver is not callable by ordinary fans.
select ok(not has_function_privilege('authenticated', 'public.channel_post_recipients(text,uuid,int)', 'execute'),
  'the push-recipients resolver is service-role only');

select * from finish();
rollback;
