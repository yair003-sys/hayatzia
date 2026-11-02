-- Admin overview console (migration 20261102110000_admin_overview): the read functions browse every club's data and
-- refuse non-admins; counts and the per-club tally are right; the user list filters and searches; the content feed
-- returns each kind with a removable ref and a plain-text preview; removing a club-news post works once and is audited.
begin;
select plan(34);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true)
$$;

-- a1 admin (mta), a2 fan (mta), a3 fan (hta), a4 fan (mta, banned).
insert into auth.users (id, aud, role, email) values
  (pg_temp.uid('0a01'), 'authenticated', 'authenticated', 'a01@test.local'),
  (pg_temp.uid('0a02'), 'authenticated', 'authenticated', 'a02@test.local'),
  (pg_temp.uid('0a03'), 'authenticated', 'authenticated', 'a03@test.local'),
  (pg_temp.uid('0a04'), 'authenticated', 'authenticated', 'a04@test.local');
insert into public.profiles (user_id, nick, team_id) values
  (pg_temp.uid('0a01'), 'מנהל', 'mta'),
  (pg_temp.uid('0a02'), 'כותב', 'mta'),
  (pg_temp.uid('0a03'), 'יריב', 'hta'),
  (pg_temp.uid('0a04'), 'חסום', 'mta');
-- a2 and a3 are 18+ confirmed (fans_verified = 2; a3 needs it to open a ride).
update public.profiles set adult_confirmed_at = '2000-01-01T00:00:00Z' where user_id in (pg_temp.uid('0a02'), pg_temp.uid('0a03'));
insert into public.app_admins (user_id) values (pg_temp.uid('0a01'));
insert into public.team_channel_admins (team_id, user_id) values ('mta', pg_temp.uid('0a01'));
-- a4 is banned from writing (active, forever).
insert into public.fan_bans (user_id, until) values (pg_temp.uid('0a04'), null);
-- a player of mta for the rating.
insert into public.players (id, team_id, name_he, name_short, position) values ('p1', 'mta', 'שחקן', 'שחקן', 'MF');
-- a fixture for the trip.
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv') on conflict do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id)
  values (7001, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4486);

-- ---------- content, each inserted by its author ----------
select pg_temp.as_fan('0a02');
set local role authenticated;
insert into public.clips (media_path, kind, caption) values (pg_temp.uid('0a02') || '/c.jpg', 'image', 'כיתוב לבדיקה');
insert into public.player_ratings (player_id, stars, review) values ('p1', 4, 'שיחק טוב');
reset role;

select pg_temp.as_fan('0a03');
set local role authenticated;
insert into public.trips (fixture_id, kind, from_city, seats) values (7001, 'seek', 'חיפה', 0);
reset role;

select pg_temp.as_fan('0a01');
set local role authenticated;
insert into public.channel_posts (title, body) values ('חדשות', 'גוף הידיעה לבדיקה');
reset role;

-- ---------- 1. non-admins are refused ----------
select pg_temp.as_fan('0a02');
set local role authenticated;
select throws_ok($$ select * from public.admin_overview_counts() $$, '42501', null, 'counts refuse a non-admin');
select throws_ok($$ select * from public.admin_fans_by_team() $$, '42501', null, 'fans-by-team refuse a non-admin');
select throws_ok($$ select * from public.admin_user_list() $$, '42501', null, 'user list refuses a non-admin');
select throws_ok($$ select * from public.admin_content_feed('clip') $$, '42501', null, 'content feed refuses a non-admin');
select throws_ok($$ select * from public.admin_remove_channel_post('00000000-0000-0000-0000-000000000000') $$,
  '42501', null, 'remove channel post refuses a non-admin');
reset role;

-- ---------- 2. the admin sees everything ----------
select pg_temp.as_fan('0a01');
set local role authenticated;

select is((select value from public.admin_overview_counts() where metric = 'fans'), 4::bigint, 'counts: 4 fans');
select is((select value from public.admin_overview_counts() where metric = 'fans_verified'), 2::bigint, 'counts: 2 verified');
select is((select value from public.admin_overview_counts() where metric = 'clips'), 1::bigint, 'counts: 1 clip');
select is((select value from public.admin_overview_counts() where metric = 'trips'), 1::bigint, 'counts: 1 trip');
select is((select value from public.admin_overview_counts() where metric = 'channel_posts'), 1::bigint, 'counts: 1 channel post');
select is((select value from public.admin_overview_counts() where metric = 'ratings'), 1::bigint, 'counts: 1 rating');
select is((select value from public.admin_overview_counts() where metric = 'active_bans'), 1::bigint, 'counts: 1 active ban');

select is((select fans from public.admin_fans_by_team() where team_id = 'mta'), 3::bigint, 'fans-by-team: 3 at mta');
select is((select team_id from public.admin_fans_by_team() limit 1), 'mta', 'fans-by-team: the biggest club is first');

select is((select count(*) from public.admin_user_list()), 4::bigint, 'user list: all four fans');
select is((select banned from public.admin_user_list() where user_id = pg_temp.uid('0a04')), true, 'user list: a4 is banned');
select is((select is_admin from public.admin_user_list() where user_id = pg_temp.uid('0a01')), true, 'user list: a1 is an admin');
select is((select count(*) from public.admin_user_list(p_team => 'hta')), 1::bigint, 'user list: one fan at hta');
select is((select nick from public.admin_user_list(p_team => 'hta')), 'יריב', 'user list: the hta fan is יריב');
select is((select count(*) from public.admin_user_list(p_search => 'כות')), 1::bigint, 'user list: search finds כותב');

select is((select count(*) from public.admin_content_feed('clip')), 1::bigint, 'feed: one clip');
select is((select author_id from public.admin_content_feed('clip')), pg_temp.uid('0a02'), 'feed: the clip is a2''s');
select ok((select preview from public.admin_content_feed('clip')) like '%כיתוב לבדיקה%', 'feed: the clip preview shows its caption');
select is((select count(*) from public.admin_content_feed('trip')), 1::bigint, 'feed: one trip');
select ok((select preview from public.admin_content_feed('trip')) like '%חיפה%', 'feed: the trip preview shows its city');
select is((select author_nick from public.admin_content_feed('channel_post')), 'מנהל', 'feed: the channel post author is מנהל');
select is((select preview from public.admin_content_feed('channel_post')), 'חדשות', 'feed: the channel post preview is its title');
select is((select ref from public.admin_content_feed('review')), 'p1:' || pg_temp.uid('0a02')::text, 'feed: the review ref is player:author');
select ok((select preview from public.admin_content_feed('review')) like '%★%', 'feed: the review preview shows stars');
select throws_ok($$ select * from public.admin_content_feed('nonsense') $$, '22023', null, 'feed: an unknown kind is rejected');

-- ---------- 3. removing a club-news post ----------
select is((select removed from public.admin_remove_channel_post((select id from public.channel_posts))), true, 'remove: the post is removed');
select is((select count(*) from public.channel_posts), 0::bigint, 'remove: no channel posts left');
select is((select count(*) from public.admin_actions where action = 'remove' and kind = 'channel_post'), 1::bigint, 'remove: the action is audited');
select is((select removed from public.admin_remove_channel_post('00000000-0000-0000-0000-000000000000')), false, 'remove: a gone post reports not removed');

reset role;
select * from finish();
rollback;
