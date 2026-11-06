-- Team news channel — posts + per-club admins (2026-11-01; wall opened to fans 2026-11-06). A post's club, author and
-- official standing are server-stamped; a club member may post to their own club, but only a channel admin's post is
-- official; fans read only their own club's posts; the client cannot set the club column; moderation is attached to
-- the free-text columns.
begin;
select plan(12);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'cp_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'cp_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'cp_rival@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'אדמין', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'אוהד', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'יריב', 'hta');
-- a1 is the Maccabi channel admin (seeded by hand in production; here as superuser).
insert into public.team_channel_admins (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000a1');

-- ===== schema =====
select has_table('public', 'channel_posts', 'the channel has a posts table');
select has_table('public', 'team_channel_admins', 'there is a per-club channel-admins table');
select has_column('public', 'channel_posts', 'reactions', 'a post carries a reactions jsonb');
select has_trigger('public', 'channel_posts', 'zz_moderate', 'the post body/title pass moderation');

-- ===== a club fan can now post to the wall, but the post is not official (rolled back so the counts below hold) =====
savepoint fan_post;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.channel_posts (body) values ('קדימה אלופים מהיציע') $$,
  'a club fan can post to the wall');
select is((select official from public.channel_posts where author_id = '00000000-0000-0000-0000-0000000000a2'), false,
  'a fan''s wall post is not official');
rollback to savepoint fan_post;
reset role;

-- ===== the admin posts; club + author are stamped from the session =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.channel_posts (title, body) values ('ניצחון', 'שבת מעולה אלופים') $$,
  'a channel admin posts an update');
select is((select team_id from public.channel_posts limit 1), 'mta', 'the post club is stamped from the admin''s club');
select is((select author_id from public.channel_posts limit 1), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'the post author is stamped from the session');
-- the club column is not client-settable (no column grant), so a cross-club team_id is refused outright
select throws_ok($$ insert into public.channel_posts (team_id, body) values ('hta', 'לא אמור') $$,
  '42501', null, 'the client cannot set the post club column');
reset role;

-- ===== reads are scoped to the fan's own club =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.channel_posts)::int, 0, 'a rival-club fan sees none of our posts');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.channel_posts)::int, 1, 'a same-club fan reads the post');
reset role;

select * from finish();
rollback;
