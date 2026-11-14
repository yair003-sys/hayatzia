-- Following across clubs (migration 20261114020000_follows): a fan sees any fan's full card and can follow them;
-- counters are kept by trigger; the social graph is private to the two sides; the card function is closed to anon.
begin;
select plan(13);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000f71', 'authenticated', 'authenticated', 'f71@test.local'),
  ('00000000-0000-0000-0000-000000000f72', 'authenticated', 'authenticated', 'f72@test.local'),
  ('00000000-0000-0000-0000-000000000f73', 'authenticated', 'authenticated', 'f73@test.local');
-- f71 and f73 are Maccabi TA; f72 is Hapoel TA — a rival, to prove the card crosses clubs.
insert into public.profiles (user_id, nick, team_id, birth_date) values
  ('00000000-0000-0000-0000-000000000f71', 'עוקב', 'mta', '1990-01-01'),
  ('00000000-0000-0000-0000-000000000f72', 'יריב', 'hta', '1990-01-01'),
  ('00000000-0000-0000-0000-000000000f73', 'שכן', 'mta', '1990-01-01');
-- A play stat on the rival, to prove the card surfaces stats across clubs (written as the system, like the real trigger).
insert into public.prediction_totals (team_id, season, user_id, points, exact)
  values ('hta', 2026, '00000000-0000-0000-0000-000000000f72', 42, 3);

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000' || p, 'role', 'authenticated')::text, true)
$$;

-- ---------- the rival's card is visible, before any follow ----------
select pg_temp.as_fan('f71');
set local role authenticated;
select is((select i_follow from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), false,
  'a fan has not yet followed the rival');
select is((select nick from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), 'יריב',
  'a fan sees a rival-club card (crosses clubs)');
select is((select points from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), 42,
  'the rival card surfaces play stats across clubs');

-- ---------- follow, and the counters move ----------
insert into public.follows (followee_id) values ('00000000-0000-0000-0000-000000000f72');
select is((select followers_count from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), 1,
  'the followed fan gains a follower');
select is((select following_count from public.fan_card('00000000-0000-0000-0000-000000000f71', 2026)), 1,
  'the follower gains a following');
select is((select i_follow from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), true,
  'the card now says I follow them');

-- ---------- a fan cannot follow themselves, nor forge the follower ----------
select throws_ok($$ insert into public.follows (followee_id) values ('00000000-0000-0000-0000-000000000f71') $$,
  '23514', null, 'a fan cannot follow themselves');
select throws_ok($$ insert into public.follows (follower_id, followee_id)
    values ('00000000-0000-0000-0000-000000000f72', '00000000-0000-0000-0000-000000000f73') $$,
  '42501', null, 'a fan cannot follow on behalf of someone else');
reset role;

-- ---------- the edge is private to the two sides ----------
select pg_temp.as_fan('f73');
set local role authenticated;
select is((select count(*)::int from public.follows
    where follower_id = '00000000-0000-0000-0000-000000000f71' and followee_id = '00000000-0000-0000-0000-000000000f72'), 0,
  'an outsider cannot see who follows whom');
reset role;

-- ---------- unfollow reverses it ----------
select pg_temp.as_fan('f71');
set local role authenticated;
delete from public.follows where followee_id = '00000000-0000-0000-0000-000000000f72';
select is((select followers_count from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), 0,
  'unfollowing removes the follower');
select is((select i_follow from public.fan_card('00000000-0000-0000-0000-000000000f72', 2026)), false,
  'the card says I no longer follow them');
reset role;

-- ---------- the card function is closed to logged-out visitors; the counter trigger to everyone ----------
select ok(not has_function_privilege('anon', 'public.fan_card(uuid, integer)', 'execute'),
  'logged-out visitors cannot read fan cards');
select ok(not has_function_privilege('authenticated', 'public.follows_counter()', 'execute'),
  'the counter trigger is not callable by fans');

select * from finish();
rollback;
