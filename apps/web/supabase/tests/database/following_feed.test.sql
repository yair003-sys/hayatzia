-- The following feed (migration 20261114030000_following_feed): following_clips returns the live clips of the fans I
-- follow, across clubs; a non-followed fan's clips and view-once clips never appear; it is closed to logged-out visitors.
begin;
select plan(5);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e81', 'authenticated', 'authenticated', 'e81@test.local'),
  ('00000000-0000-0000-0000-000000000e82', 'authenticated', 'authenticated', 'e82@test.local'),
  ('00000000-0000-0000-0000-000000000e83', 'authenticated', 'authenticated', 'e83@test.local');
insert into public.profiles (user_id, nick, team_id, birth_date) values
  ('00000000-0000-0000-0000-000000000e81', 'עוקב81', 'mta', '1990-01-01'),
  ('00000000-0000-0000-0000-000000000e82', 'יריב82', 'hta', '1990-01-01'),
  ('00000000-0000-0000-0000-000000000e83', 'זר83', 'mta', '1990-01-01');

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;

-- The rival (e82) posts a normal clip and a view-once clip; an unfollowed fan (e83) posts a clip.
select pg_temp.as_fan('e82');
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-000000000e82/a.jpg', 'image');
insert into public.clips (media_path, kind, once) values ('00000000-0000-0000-0000-000000000e82/b.jpg', 'image', true);
reset role;
select pg_temp.as_fan('e83');
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-000000000e83/c.jpg', 'image');
reset role;

-- e81 follows only the rival e82.
select pg_temp.as_fan('e81');
set local role authenticated;
insert into public.follows (followee_id) values ('00000000-0000-0000-0000-000000000e82');

select is((select count(*)::int from public.following_clips(10, 0)), 1,
  'the feed shows exactly the one live, non-once clip of the followed rival');
select is((select nick from public.following_clips(10, 0)), 'יריב82',
  'a followed rival''s clip surfaces across clubs');
select is((select user_id from public.following_clips(10, 0)), '00000000-0000-0000-0000-000000000e82'::uuid,
  'an unfollowed fan''s clip never appears');
select ok(not exists (select 1 from public.following_clips(10, 0) where once),
  'view-once clips are not surfaced in the feed');
reset role;

select ok(not has_function_privilege('anon', 'public.following_clips(integer, integer)', 'execute'),
  'logged-out visitors cannot read the following feed');

select * from finish();
rollback;
