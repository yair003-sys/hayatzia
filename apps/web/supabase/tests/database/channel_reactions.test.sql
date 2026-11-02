-- Channel post reactions (2026-11-01): any emoji, one per fan per post, counts kept on the post as a jsonb, writes
-- limited to the fan's own row and own club. Mirrors the shipped message_reactions model.
begin;
select plan(7);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'cr_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'cr_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cr_rival@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'אדמין', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'אוהד', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'יריב', 'hta');
insert into public.team_channel_admins (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000a1');

-- the admin posts; capture its id for the fan roles below.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('גול בדקה 90');
reset role;
create temp table _p as select id from public.channel_posts limit 1;
grant select on _p to authenticated;

select has_table('public', 'channel_post_reactions', 'channel posts have a reactions table');

-- a same-club fan reacts; both the fan's and the admin's reactions land on the post.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.channel_post_reactions (post_id, emoji) select id, '❤️' from _p $$,
  'a same-club fan reacts to a post');
select throws_ok($$ insert into public.channel_post_reactions (post_id, emoji) select id, '🔥' from _p $$,
  '23505', null, 'a fan gets one reaction per post');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_post_reactions (post_id, emoji) select id, '🔥' from _p;
reset role;
select is((select t.reactions from public.channel_posts t, _p where t.id = _p.id), '{"❤️": 1, "🔥": 1}'::jsonb,
  'the post counts both reactions');

-- a rival-club fan cannot react to our post.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.channel_post_reactions (post_id, emoji) select id, '👎' from _p $$,
  '42501', null, 'a rival-club fan cannot react to our post');
reset role;

-- switching / removing my reaction moves the counts (only my own row).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
update public.channel_post_reactions set emoji = '👏' where post_id = (select id from _p);
select is((select t.reactions from public.channel_posts t, _p where t.id = _p.id), '{"🔥": 1, "👏": 1}'::jsonb,
  'switching my emoji moves the count');
delete from public.channel_post_reactions where post_id = (select id from _p);
select is((select t.reactions from public.channel_posts t, _p where t.id = _p.id), '{"🔥": 1}'::jsonb,
  'removing my reaction leaves the admin''s');
reset role;

select * from finish();
rollback;
