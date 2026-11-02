-- Cross-club profile visibility (2026-11-02): a fan may read another club's fan's public fields, but sensitive columns
-- stay protected by the column-level grant.
begin;
select plan(3);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pcc_mta@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'pcc_hta@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'מכבי', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'הפועל', 'hta');

-- a Hapoel fan reads a Maccabi fan's public profile fields (cross-club now allowed).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is((select nick from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1'), 'מכבי',
  'a rival-club fan can read another fan''s nick');
select is((select team_id from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1'), 'mta',
  'a rival-club fan can read another fan''s club');
-- sensitive columns remain protected by the column grant.
select throws_ok($$ select birth_date from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'birth dates stay unreadable');
reset role;

select * from finish();
rollback;
