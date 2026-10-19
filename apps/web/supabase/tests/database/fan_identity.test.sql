-- The lifetime "posts" counter bumps when a fan publishes a clip (fuels the "creator" label).
begin;
select plan(3);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'f1@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'יוצר', 'mta');

select is((select clips_posted from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'), 0, 'a new fan starts at 0 posts');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-0000000000f1/a.jpg', 'image');
reset role;

select is((select clips_posted from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'the counter bumps when the fan posts');

-- Read as the signed-in fan (not superuser) so a missing column grant would fail here.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select is((select clips_posted from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'the fan can read their own post count (column grant)');
reset role;

select * from finish();
rollback;
