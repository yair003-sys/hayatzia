-- Team chat, richer (2026-11-28): official flag, media messages, member count. Mirrors the message_reactions harness.
begin;
select plan(9);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'tb1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'tb2@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'td1@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000b2', 'כחול', 'mta'),
  ('00000000-0000-0000-0000-0000000000d1', 'אדום', 'hta');

-- ===== schema =====
select has_column('public', 'team_messages', 'official', 'a message carries an official flag');
select has_column('public', 'team_messages', 'media_path', 'a message can carry media');
select has_column('public', 'team_messages', 'media_kind', 'a message records its media kind');

-- ===== a normal member's message is not official =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
insert into public.team_messages (body) values ('קדימה מכבי');
reset role;
select is((select official from public.team_messages order by created_at desc limit 1), false,
  'a regular member message is not marked official');

-- ===== member count sees my club's size =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select is(public.team_member_count(), 2::bigint, 'the member count is my club''s profiles');
reset role;

-- ===== a media message may carry an empty caption =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.team_messages (media_path, media_kind) values ('00000000-0000-0000-0000-0000000000b1/clip.mp4', 'video') $$,
  'a media message with no caption is allowed');

-- ===== but an empty message with no media is refused =====
select throws_ok(
  $$ insert into public.team_messages (body) values ('   ') $$,
  '23514', null, 'an empty message with no media is refused');

-- ===== media and its kind must travel together =====
select throws_ok(
  $$ insert into public.team_messages (media_path) values ('00000000-0000-0000-0000-0000000000b1/x.jpg') $$,
  '23514', null, 'media without a kind is refused');
reset role;

-- ===== the chat media bucket is public (CDN) =====
select is((select public from storage.buckets where id = 'chat'), true, 'the chat bucket is public');

select * from finish();
rollback;
