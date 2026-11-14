-- In-app search (migration 20261114040000_search): people, wall posts and league-wide clips are found across clubs; a
-- club-only clip never surfaces from another club; the functions are closed to logged-out visitors.
begin;
select plan(5);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000c91', 'authenticated', 'authenticated', 'c91@test.local'),
  ('00000000-0000-0000-0000-000000000c92', 'authenticated', 'authenticated', 'c92@test.local');
insert into public.profiles (user_id, nick, team_id, birth_date) values
  ('00000000-0000-0000-0000-000000000c91', 'מחפש91', 'mta', '1990-01-01'),
  ('00000000-0000-0000-0000-000000000c92', 'יריב92', 'hta', '1990-01-01');

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;

-- The rival (c92) writes a wall post, a league-wide clip, and a club-only clip.
select pg_temp.as_fan('c92');
set local role authenticated;
insert into public.channel_posts (body) values ('ניצחון ענק הערב באצטדיון');
insert into public.clips (media_path, kind, caption, audience) values ('00000000-0000-0000-0000-000000000c92/g.jpg', 'image', 'גול מטורף מהיציע', 'all');
insert into public.clips (media_path, kind, caption, audience) values ('00000000-0000-0000-0000-000000000c92/s.jpg', 'image', 'סודי לקבוצה', 'team');
reset role;

-- The searcher (c91, another club) finds all three across clubs — but not the club-only clip.
select pg_temp.as_fan('c91');
set local role authenticated;
select ok((select count(*)::int from public.search_fans('יריב', 20)) >= 1, 'a rival-club fan is found by nick');
select ok((select count(*)::int from public.search_posts('ניצחון', 20)) >= 1, 'a rival-club wall post is found by text');
select is((select user_id from public.search_clips('גול', 20)), '00000000-0000-0000-0000-000000000c92'::uuid,
  'a league-wide rival clip is found across clubs');
select is((select count(*)::int from public.search_clips('סודי', 20)), 0,
  'a club-only clip never surfaces from another club');
reset role;

select ok(not has_function_privilege('anon', 'public.search_fans(text, integer)', 'execute'),
  'logged-out visitors cannot search');

select * from finish();
rollback;
