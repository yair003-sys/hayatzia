-- The Square: 24-hour posts, view-once, likes, rival-only respect, comments, counters.
begin;
select plan(18);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'f1@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'f2@test.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'f3@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'מעלה', 'mta'),
  ('00000000-0000-0000-0000-0000000000f2', 'חבר', 'mta'),
  ('00000000-0000-0000-0000-0000000000f3', 'יריב', 'hta');

-- f1 posts a regular clip and a view-once clip.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.clips (media_path, kind, caption) values ('00000000-0000-0000-0000-0000000000f1/a.jpg', 'image', ' שער! ') $$,
  'a fan posts to the Square');
select lives_ok($$ insert into public.clips (media_path, kind, once) values ('00000000-0000-0000-0000-0000000000f1/b.mp4', 'video', true) $$,
  'a fan posts a view-once video');
select throws_ok($$ insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-0000000000f2/c.jpg', 'image') $$,
  '42501', null, 'media must be in the poster''s own folder');
select throws_ok($$ insert into public.clips (media_path, kind, likes_count) values ('00000000-0000-0000-0000-0000000000f1/d.jpg', 'image', 999) $$,
  '42501', null, 'counters cannot be set by fans');
select results_eq($$ select team_id, nick::text, caption::text, (expires_at - created_at) = interval '24 hours' from public.clips where kind = 'image' $$,
  $$ values ('mta'::text, 'מעלה'::text, 'שער!'::text, true) $$, 'server stamps club, nickname, trimmed caption and 24h expiry');
select throws_ok($$ insert into public.clip_respects (clip_id) select id from public.clips where kind = 'image' $$,
  '42501', null, 'no respect for your own club');
reset role;

-- f2 (same club) likes; f3 (rival) likes and gives respect.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.clip_likes (clip_id) select id from public.clips where kind = 'image' $$, 'a fan likes a post');
select throws_ok($$ insert into public.clip_likes (clip_id) select id from public.clips where kind = 'image' $$, '23505', null, 'one like per fan');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.clips), 2, 'rivals see the whole Square');
select lives_ok($$ insert into public.clip_respects (clip_id) select id from public.clips where kind = 'image' $$, 'a rival gives respect');
select lives_ok($$ insert into public.clip_comments (clip_id, body) select id, 'כל הכבוד' from public.clips where kind = 'image' $$, 'a rival comments');
-- View-once: after the first view it is gone for this fan.
select lives_ok($$ insert into public.clip_views (clip_id) select id from public.clips where once $$, 'a fan views a view-once post');
select is((select count(*)::int from public.clips where once), 0, 'the view-once post disappears for that fan');
reset role;

select results_eq($$ select likes_count, respects_count, comments_count from public.clips where kind = 'image' $$,
  $$ values (1, 1, 1) $$, 'counters are kept by triggers');
select is((select views_count from public.clips where once), 1, 'views are counted');

-- The owner still sees the view-once post; nobody sees expired posts.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.clips where once), 1, 'the owner always sees their view-once post');
reset role;
update public.clips set expires_at = now() - interval '1 second' where kind = 'image';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.clips where kind = 'image'), 0, 'expired posts are hidden at once');
reset role;

select is((select count(*)::int from storage.buckets where id = 'clips' and not public), 1, 'media bucket is private');

select * from finish();
rollback;
