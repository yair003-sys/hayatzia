-- "מחיקת החשבון" (2026-10-15): the app deletes the auth user and relies on the foreign keys to remove the fan's rows.
-- Guards that every table keeps it that way: a new table that references auth.users must cascade (or set null for a
-- "who did it" column), or account deletion would fail or leave the fan's data behind.
begin;
select plan(4);

select is(
  (select count(*)::int
     from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and c.confdeltype not in ('c', 'n')),
  0,
  'every public foreign key to auth.users is ON DELETE CASCADE or SET NULL'
);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000d01', 'authenticated', 'authenticated', 'd01@test.local'),
  ('00000000-0000-0000-0000-000000000d02', 'authenticated', 'authenticated', 'd02@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-000000000d01', 'נמחק', 'mta'),
  ('00000000-0000-0000-0000-000000000d02', 'נשאר', 'mta');
insert into public.blocks (user_id, blocked_id) values
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000d01');
insert into public.reports (reporter_id, kind, ref, reason) values
  ('00000000-0000-0000-0000-000000000d01', 'user', '00000000-0000-0000-0000-000000000d02', 'ספאם');

delete from auth.users where id = '00000000-0000-0000-0000-000000000d01';

select is((select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000d01'), 0,
  'the profile goes with the account');
select is((select count(*)::int from public.blocks where blocked_id = '00000000-0000-0000-0000-000000000d01')
        + (select count(*)::int from public.reports where reporter_id = '00000000-0000-0000-0000-000000000d01'), 0,
  'rows that point at the deleted fan go too');
select is((select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000d02'), 1,
  'other fans are untouched');

select * from finish();
rollback;
