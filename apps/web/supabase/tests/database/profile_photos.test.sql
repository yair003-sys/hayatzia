-- Profile photos (2026-10-31): a fan writes avatars/covers only into their own folder, and may point their
-- profile only at a path in that folder. Migration 20261031200000_profile_photos.
begin;
select plan(5);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.as_fan(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true)
$$;

insert into auth.users (id, aud, role, email) values
  (pg_temp.uid(1), 'authenticated', 'authenticated', 'pp1@test.local'),
  (pg_temp.uid(2), 'authenticated', 'authenticated', 'pp2@test.local');
insert into public.profiles (user_id, nick, team_id, birth_date) values
  (pg_temp.uid(1), 'one', 'mta', '1990-01-01'),
  (pg_temp.uid(2), 'two', 'mta', '1990-01-01');

-- ===== storage: write only your own folder =====
select pg_temp.as_fan(1);
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name, owner)
  values ('avatars', '00000000-0000-0000-0000-000000000001/a.jpg', '00000000-0000-0000-0000-000000000001') $$,
  'a fan uploads an avatar into their own folder');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner)
  values ('covers', '00000000-0000-0000-0000-000000000001/c.jpg', '00000000-0000-0000-0000-000000000001') $$,
  'a fan uploads a cover into their own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
  values ('avatars', '00000000-0000-0000-0000-000000000002/x.jpg', '00000000-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'a fan cannot upload into another fan''s folder');
reset role;

-- ===== profile: the chosen path must be in your own folder =====
select pg_temp.as_fan(1);
set local role authenticated;
select lives_ok($$ update public.profiles
    set avatar_path = '00000000-0000-0000-0000-000000000001/a.jpg',
        cover_path  = '00000000-0000-0000-0000-000000000001/c.jpg'
    where user_id = '00000000-0000-0000-0000-000000000001' $$,
  'a fan sets their own photo paths');
select throws_ok($$ update public.profiles
    set avatar_path = '00000000-0000-0000-0000-000000000002/a.jpg'
    where user_id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', 'bad_path', 'a path outside the fan''s folder is refused');
reset role;

select * from finish();
rollback;
