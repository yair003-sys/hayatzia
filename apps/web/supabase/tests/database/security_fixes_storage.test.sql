-- Security fixes 2026-10-17 — M4: a per-fan object cap per bucket (300), and the orphan finder the cleanup script uses.
-- Migration 20261017130000_security_fixes.
begin;
select plan(5);

create function pg_temp.uid(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.as_fan(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true)
$$;

insert into auth.users (id, aud, role, email) values
  (pg_temp.uid(1), 'authenticated', 'authenticated', 'st1@test.local'),
  (pg_temp.uid(2), 'authenticated', 'authenticated', 'st2@test.local');
insert into public.profiles (user_id, nick, team_id, birth_date) values
  (pg_temp.uid(1), 'cap', 'mta', '1990-01-01'),
  (pg_temp.uid(2), 'orf', 'mta', '1990-01-01');

-- ===== cap: 300 objects per fan per bucket =====
select lives_ok($$ insert into storage.objects (bucket_id, name, owner)
  select 'clips', '00000000-0000-0000-0000-000000000001/' || g || '.jpg', '00000000-0000-0000-0000-000000000001'
  from generate_series(1, 300) g $$, 'M4: a fan may hold up to 300 objects in a bucket');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
  values ('clips', '00000000-0000-0000-0000-000000000001/301.jpg', '00000000-0000-0000-0000-000000000001') $$,
  'P0001', 'upload_cap', 'M4: the 301st object is refused');

-- ===== orphans: no matching clips row, older than an hour =====
-- A clip with its file (not an orphan).
select pg_temp.as_fan(2);
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-000000000002/has.jpg', 'image');
reset role;
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('clips', '00000000-0000-0000-0000-000000000002/has.jpg', pg_temp.uid(2), now() - interval '2 hours'),
  ('clips', '00000000-0000-0000-0000-000000000002/old.jpg', pg_temp.uid(2), now() - interval '2 hours'),
  ('clips', '00000000-0000-0000-0000-000000000002/new.jpg', pg_temp.uid(2), now());

select set_config('t.orphans', (select coalesce(string_agg(name, ','), '') from public.orphan_clip_objects(500)), true);
select ok(current_setting('t.orphans') like '%00000000-0000-0000-0000-000000000002/old.jpg%',
  'M4: an old file with no clips row is an orphan');
select ok(current_setting('t.orphans') not like '%00000000-0000-0000-0000-000000000002/new.jpg%',
  'M4: a file younger than an hour is not collected yet');
select ok(current_setting('t.orphans') not like '%00000000-0000-0000-0000-000000000002/has.jpg%',
  'M4: a file with a matching clips row is never an orphan');

select * from finish();
rollback;
