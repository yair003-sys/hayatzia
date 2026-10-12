-- The Square's team tab: a post can go to the whole league or only to the poster's club.
begin;
select plan(7);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'a2@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'a3@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'מעלה', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'חבר', 'mta'),
  ('00000000-0000-0000-0000-0000000000a3', 'יריב', 'hta');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.clips (media_path, kind, audience) values ('00000000-0000-0000-0000-0000000000a1/t.jpg', 'image', 'team') $$,
  'a fan posts to their club only');
select lives_ok($$ insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-0000000000a1/l.jpg', 'image') $$,
  'a post goes to the whole league by default');
select throws_ok($$ insert into public.clips (media_path, kind, audience) values ('00000000-0000-0000-0000-0000000000a1/x.jpg', 'image', 'friends') $$,
  '23514', null, 'only "all" or "team"');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.clips where audience = 'team'), 1, 'a fan of the same club sees the team post');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
select is((select string_agg(audience, ',') from public.clips), 'all', 'a rival sees only the league post');
select throws_ok($$ insert into public.clip_likes (clip_id) select id from public.clips where media_path like '%t.jpg' $$,
  '42501', null, 'a rival cannot like a team post they cannot see');
select is((select count(*)::int from storage.objects where name like '%t.jpg'), 0, 'nor sign its file');
reset role;

select * from finish();
rollback;
