-- Channel post views (2026-11-01): one unique view per fan, views_count incremented once per fan by trigger.
begin;
select plan(4);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'cv_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'cv_fan@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'אדמין', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'אוהד', 'mta');
insert into public.team_channel_admins (team_id, user_id) values ('mta', '00000000-0000-0000-0000-0000000000a1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_posts (body) values ('עדכון');
reset role;
create temp table _p as select id from public.channel_posts limit 1;
grant select on _p to authenticated;

-- a fan opens the post once.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_post_views (post_id) select id from _p;
select is((select views_count from public.channel_posts, _p where channel_posts.id = _p.id), 1, 'the first view counts');
-- the same fan opening again does not double-count (PK).
select throws_ok($$ insert into public.channel_post_views (post_id) select id from _p $$,
  '23505', null, 'the same fan cannot record a second view');
select is((select views_count from public.channel_posts, _p where channel_posts.id = _p.id), 1, 'views_count stays at one');
reset role;

-- a second fan's view bumps the counter.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.channel_post_views (post_id) select id from _p;
select is((select views_count from public.channel_posts, _p where channel_posts.id = _p.id), 2, 'a second fan''s view counts');
reset role;

select * from finish();
rollback;
