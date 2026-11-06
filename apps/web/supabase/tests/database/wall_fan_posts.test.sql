-- The wall opened to fans (2026-11-06): any club member posts to their own club; only an admin's post is official;
-- a fan edits/deletes only their own post; an admin may moderate (delete) any post in their club; fan posts are
-- rate-limited; the club is always stamped from the session, so no cross-club post is possible.
begin;
select plan(10);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'authenticated', 'authenticated', 'wall_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'authenticated', 'authenticated', 'wall_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000b3'::uuid, 'authenticated', 'authenticated', 'wall_fan2@test.local'),
  ('00000000-0000-0000-0000-0000000000b4'::uuid, 'authenticated', 'authenticated', 'wall_rival@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'אדמין', 'mta'),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'אוהד1', 'mta'),
  ('00000000-0000-0000-0000-0000000000b3'::uuid, 'אוהד2', 'mta'),
  ('00000000-0000-0000-0000-0000000000b4'::uuid, 'יריב', 'hta');
insert into public.team_channel_admins (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000b1'::uuid);

-- ===== an admin's post is official =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('הודעה רשמית מהמועדון');
select is((select official from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b1'::uuid),
  true, 'an admin post is official');
reset role;

-- ===== a fan posts; the post exists and is not official =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.channel_posts (body) values ('קדימה מכבי מהיציע') $$, 'a club fan posts to the wall');
select is((select official from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid),
  false, 'a fan post is not official');
-- a fan edits their own post
select lives_ok($$ update public.channel_posts set body = 'קדימה מכבי — עודכן' where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid $$,
  'a fan edits their own post');
reset role;

-- ===== a second fan cannot edit or delete the first fan's post =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
update public.channel_posts set body = 'חטיפה' where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid;  -- RLS: 0 rows
select is((select body from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid),
  'קדימה מכבי — עודכן', 'another fan cannot edit my post');
delete from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid;  -- RLS: 0 rows
select is((select count(*) from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid)::int,
  1, 'another fan cannot delete my post');
reset role;

-- ===== an admin may moderate (delete) any post in the club =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ delete from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid $$,
  'an admin deletes a fan post (moderation)');
select is((select count(*) from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b2'::uuid)::int,
  0, 'the moderated fan post is gone');
reset role;

-- ===== fan posts are rate-limited (5th within the window is refused) =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('פוסט 1 מהיציע');
insert into public.channel_posts (body) values ('פוסט 2 מהיציע');
insert into public.channel_posts (body) values ('פוסט 3 מהיציע');
insert into public.channel_posts (body) values ('פוסט 4 מהיציע');
select throws_ok($$ insert into public.channel_posts (body) values ('פוסט 5 מהיציע') $$,
  'P0001', null, 'a fan is rate-limited after several posts in a short window');
reset role;

-- ===== the club is always stamped from the session: a rival only ever posts to their own club =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('הפועל מהיציע');
select is((select team_id from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000b4'::uuid),
  'hta', 'a post is always stamped to the author''s own club');
reset role;

select * from finish();
rollback;
