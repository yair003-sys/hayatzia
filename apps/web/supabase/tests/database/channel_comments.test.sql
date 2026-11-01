-- Channel post comments (2026-11-01): per-post thread, club/nick/time stamped, same-club only, moderated, rate-limited
-- 5/10s, comments_count kept on the post by trigger.
begin;
select plan(9);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'cc_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'cc_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cc_rival@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'אדמין', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'אוהד', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'יריב', 'hta');
insert into public.team_channel_admins (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000a1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('מי בא למשחק?');
reset role;
create temp table _p as select id from public.channel_posts limit 1;
grant select on _p to authenticated;

select has_table('public', 'channel_post_comments', 'the channel has a comments table');
select has_trigger('public', 'channel_post_comments', 'zz_moderate', 'comment bodies pass moderation');
select has_index('public', 'channel_post_comments', 'channel_post_comments_user_idx', 'the rate-limit lookup is indexed');

-- a same-club fan comments; the post's counter and the stamped nick reflect it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.channel_post_comments (post_id, body) select id, 'אני בא!' from _p $$,
  'a same-club fan comments on a post');
select is((select comments_count from public.channel_posts, _p where channel_posts.id = _p.id), 1,
  'the post comments_count is kept by trigger');
select is((select nick from public.channel_post_comments limit 1), 'אוהד', 'the comment nick is stamped from the profile');
reset role;

-- a rival-club fan cannot comment on our post.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.channel_post_comments (post_id, body) select id, 'בוז' from _p $$,
  '42501', null, 'a rival-club fan cannot comment on our post');
reset role;

-- rate limit: the fan already has 1 comment; four more are fine, the sixth within 10s is refused.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_post_comments (post_id, body) select id, 'עוד 2' from _p;
insert into public.channel_post_comments (post_id, body) select id, 'עוד 3' from _p;
insert into public.channel_post_comments (post_id, body) select id, 'עוד 4' from _p;
insert into public.channel_post_comments (post_id, body) select id, 'עוד 5' from _p;
select throws_ok($$ insert into public.channel_post_comments (post_id, body) select id, 'עוד 6' from _p $$,
  'P0001', null, 'a sixth comment within 10 seconds is rate-limited');
-- removing comments decrements the counter back to zero.
delete from public.channel_post_comments where post_id = (select id from _p);
select is((select comments_count from public.channel_posts, _p where channel_posts.id = _p.id), 0,
  'deleting the comments drops the counter back to zero');
reset role;

select * from finish();
rollback;
