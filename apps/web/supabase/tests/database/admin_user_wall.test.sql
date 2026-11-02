-- Admin user wall (migration 20261102120000_admin_user_wall): the detail header and the per-user content feed refuse
-- non-admins, report a fan's counts and standing, and return only that fan's own content, filtered by kind.
begin;
select plan(18);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true)
$$;

-- a1 admin+channel admin (mta), a2 fan (mta) with a clip and a review, a3 fan (hta) with a trip.
insert into auth.users (id, aud, role, email) values
  (pg_temp.uid('0b01'), 'authenticated', 'authenticated', 'b01@test.local'),
  (pg_temp.uid('0b02'), 'authenticated', 'authenticated', 'b02@test.local'),
  (pg_temp.uid('0b03'), 'authenticated', 'authenticated', 'b03@test.local');
insert into public.profiles (user_id, nick, team_id) values
  (pg_temp.uid('0b01'), 'מנהל', 'mta'),
  (pg_temp.uid('0b02'), 'כותב', 'mta'),
  (pg_temp.uid('0b03'), 'יריב', 'hta');
update public.profiles set adult_confirmed_at = '2000-01-01T00:00:00Z', birth_date = '1990-01-01'
 where user_id in (pg_temp.uid('0b02'), pg_temp.uid('0b03'));
insert into public.app_admins (user_id) values (pg_temp.uid('0b01'));
insert into public.team_channel_admins (team_id, user_id) values ('mta', pg_temp.uid('0b01'));
insert into public.players (id, team_id, name_he, name_short, position) values ('p1', 'mta', 'שחקן', 'שחקן', 'MF');
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv') on conflict do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id)
  values (7101, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4486);

select pg_temp.as_fan('0b02');
set local role authenticated;
insert into public.clips (media_path, kind, caption) values (pg_temp.uid('0b02') || '/c.jpg', 'image', 'כיתוב לבדיקה');
insert into public.player_ratings (player_id, stars, review) values ('p1', 4, 'שיחק טוב');
reset role;

select pg_temp.as_fan('0b03');
set local role authenticated;
insert into public.trips (fixture_id, kind, from_city, seats) values (7101, 'seek', 'חיפה', 0);
reset role;

select pg_temp.as_fan('0b01');
set local role authenticated;
insert into public.channel_posts (title, body) values ('חדשות', 'גוף הידיעה לבדיקה');
reset role;

-- ---------- 1. non-admins refused ----------
select pg_temp.as_fan('0b02');
set local role authenticated;
select throws_ok($$ select * from public.admin_user_detail('00000000-0000-0000-0000-000000000b02') $$, '42501', null, 'user detail refuses a non-admin');
select throws_ok($$ select * from public.admin_user_content('00000000-0000-0000-0000-000000000b02', 'clip') $$, '42501', null, 'user content refuses a non-admin');
reset role;

-- ---------- 2. the admin sees one fan's wall ----------
select pg_temp.as_fan('0b01');
set local role authenticated;

select is((select nick from public.admin_user_detail(pg_temp.uid('0b02'))), 'כותב', 'detail: the right fan');
select is((select verified from public.admin_user_detail(pg_temp.uid('0b02'))), true, 'detail: verified');
select is((select banned from public.admin_user_detail(pg_temp.uid('0b02'))), false, 'detail: not banned');
select is((select is_admin from public.admin_user_detail(pg_temp.uid('0b02'))), false, 'detail: not an admin');
select is((select clips from public.admin_user_detail(pg_temp.uid('0b02'))), 1::bigint, 'detail: one clip');
select is((select trips from public.admin_user_detail(pg_temp.uid('0b02'))), 0::bigint, 'detail: no trips');
select is((select reviews from public.admin_user_detail(pg_temp.uid('0b02'))), 1::bigint, 'detail: one review');
select is((select channel_posts from public.admin_user_detail(pg_temp.uid('0b02'))), 0::bigint, 'detail: no channel posts');
select is((select channel_posts from public.admin_user_detail(pg_temp.uid('0b01'))), 1::bigint, 'detail: the admin has one channel post');
select is((select is_admin from public.admin_user_detail(pg_temp.uid('0b01'))), true, 'detail: a1 is an admin');

select is((select count(*) from public.admin_user_content(pg_temp.uid('0b02'), 'clip')), 1::bigint, 'content: a2 has one clip');
select is((select author_id from public.admin_user_content(pg_temp.uid('0b02'), 'clip')), pg_temp.uid('0b02'), 'content: the clip is a2''s');
select is((select count(*) from public.admin_user_content(pg_temp.uid('0b02'), 'trip')), 0::bigint, 'content: a2 has no trips');
select is((select count(*) from public.admin_user_content(pg_temp.uid('0b03'), 'trip')), 1::bigint, 'content: a3 has one trip');
select ok((select preview from public.admin_user_content(pg_temp.uid('0b02'), 'review')) like '%★%', 'content: a2''s review shows stars');
select throws_ok($$ select * from public.admin_user_content('00000000-0000-0000-0000-000000000b02', 'nonsense') $$, '22023', null, 'content: an unknown kind is rejected');

reset role;
select * from finish();
rollback;
