-- The "both feeds" option: a 'both' post is public (seen by rivals too), while a 'team' post stays club-only.
begin;
select plan(4);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b2@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'b3@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'מעלה', 'mta'),
  ('00000000-0000-0000-0000-0000000000b2', 'חבר', 'mta'),
  ('00000000-0000-0000-0000-0000000000b3', 'יריב', 'hta');

-- The poster (mta) publishes one "both feeds" post and one club-only post.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.clips (media_path, kind, audience) values ('00000000-0000-0000-0000-0000000000b1/both.jpg', 'image', 'both') $$,
  'a fan can post to both feeds');
insert into public.clips (media_path, kind, audience) values ('00000000-0000-0000-0000-0000000000b1/team.jpg', 'image', 'team');
reset role;

-- A rival (other club) sees the "both" post but never the club-only post.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.clips where audience = 'both'), 1, 'a rival sees the both-feeds post');
select is((select count(*)::int from public.clips where audience = 'team'), 0, 'a rival still cannot see a club-only post');
reset role;

-- A club-mate sees the "both" post as well.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.clips where audience = 'both'), 1, 'a club-mate sees the both-feeds post');
reset role;

select * from finish();
rollback;
