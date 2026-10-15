-- Activity bell: one row per (fan, kind, post / trip [, requester]) kept by triggers on likes and trip requests;
-- exact like counts, never about your own actions, blocked fans never surface, badge = rows after "seen",
-- own rows only, no client writes, ids-only broadcast on inbox:<fan>, 60-day prune.
begin;
select plan(58);

-- c1 owner / driver (mta), c2 and c3 teammates, c4 a teammate c1 blocked, c5 a rival, c6 and c7 teammates whose
-- accounts are deleted near the end.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'c2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c3@test.local'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'c4@test.local'),
  ('00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', 'c5@test.local'),
  ('00000000-0000-0000-0000-0000000000c6', 'authenticated', 'authenticated', 'c6@test.local'),
  ('00000000-0000-0000-0000-0000000000c7', 'authenticated', 'authenticated', 'c7@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'בעלים', 'mta'),
  ('00000000-0000-0000-0000-0000000000c2', 'אוהד', 'mta'),
  ('00000000-0000-0000-0000-0000000000c3', 'שני', 'mta'),
  ('00000000-0000-0000-0000-0000000000c4', 'חסום', 'mta'),
  ('00000000-0000-0000-0000-0000000000c5', 'זר', 'hta'),
  ('00000000-0000-0000-0000-0000000000c6', 'שישי', 'mta'),
  ('00000000-0000-0000-0000-0000000000c7', 'שביעי', 'mta');
-- Rides are 18+ (20261015220000_ride_safety): these fans confirmed it.
update public.profiles set adult_confirmed_at = now();
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4500, 'Hapoel Hadera')
  on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id)
  values (88, 383, 2026, 'R1', now() + interval '3 days', 'NS', 604, 4500);

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000' || p, 'role', 'authenticated')::text, true)
$$;
-- The owner's rows of one kind as 'actor:count,…' (actor = last two characters of the id), 'none' when empty.
create function pg_temp.rows_of(p_kind text) returns text language sql as $$
  select coalesce(string_agg(coalesce(right(actor_id::text, 2), '?') || ':' || actor_count, ',' order by id), 'none')
  from public.activity where user_id = '00000000-0000-0000-0000-0000000000c1' and kind = p_kind
$$;

-- c1 posts a clip and a stand photo, offers a ride, blocks c4, and likes their own posts.
select pg_temp.as_fan('c1');
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-0000000000c1/a.jpg', 'image');
insert into public.team_photos (media_path) values ('00000000-0000-0000-0000-0000000000c1/p.jpg');
insert into public.trips (fixture_id, kind, from_city, seats) values (88, 'offer', 'חיפה', 2);
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-0000000000c4');
insert into public.clip_likes (clip_id) select id from public.clips;
insert into public.team_photo_likes (photo_id) select id from public.team_photos;
reset role;
select is(pg_temp.rows_of('clip_like'), 'none', 'liking your own clip notifies nobody');
select is(pg_temp.rows_of('photo_like'), 'none', 'liking your own photo notifies nobody');

-- ── clip likes: exact counts through like / unlike / re-like ──
select pg_temp.as_fan('c2');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips;
reset role;
select is(pg_temp.rows_of('clip_like'), 'c2:1', 'a like makes one row for the owner: the liker, count 1');

select pg_temp.as_fan('c3');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips;
reset role;
select is(pg_temp.rows_of('clip_like'), 'c3:2', 'a second like updates the same row: latest liker, count 2');

select pg_temp.as_fan('c2');
set local role authenticated;
delete from public.clip_likes;
reset role;
select is(pg_temp.rows_of('clip_like'), 'c3:1', 'an unlike lowers the count');

select pg_temp.as_fan('c2');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips;
reset role;
select is(pg_temp.rows_of('clip_like'), 'c2:2', 'a re-like counts again and is the latest liker');

select pg_temp.as_fan('c2');
set local role authenticated;
delete from public.clip_likes;
reset role;
select is(pg_temp.rows_of('clip_like'), 'c3:1', 'when the latest liker unlikes, a remaining liker is shown');

select pg_temp.as_fan('c4');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips;
reset role;
select is(pg_temp.rows_of('clip_like'), 'c3:1', 'a like from a fan the owner blocked never surfaces');

select pg_temp.as_fan('c3');
set local role authenticated;
delete from public.clip_likes;
reset role;
select is(pg_temp.rows_of('clip_like'), 'none',
  'when every counted like is gone the row disappears (the owner''s own and a blocked fan''s likes do not keep it)');

select pg_temp.as_fan('c4');
set local role authenticated;
delete from public.clip_likes;
reset role;
select is(pg_temp.rows_of('clip_like'), 'none', 'a blocked fan''s unlike changes nothing');
select is((select count(*)::int from public.activity where user_id <> '00000000-0000-0000-0000-0000000000c1'), 0,
  'likers themselves get no rows');

-- ── stand photo likes ──
select pg_temp.as_fan('c2');
set local role authenticated;
insert into public.team_photo_likes (photo_id) select id from public.team_photos;
reset role;
select is(pg_temp.rows_of('photo_like'), 'c2:1', 'a photo like makes one row for the owner');
select pg_temp.as_fan('c3');
set local role authenticated;
insert into public.team_photo_likes (photo_id) select id from public.team_photos;
reset role;
select is(pg_temp.rows_of('photo_like'), 'c3:2', 'a second photo like: latest liker, count 2');
select pg_temp.as_fan('c3');
set local role authenticated;
delete from public.team_photo_likes;
reset role;
select is(pg_temp.rows_of('photo_like'), 'c2:1', 'a photo unlike lowers the count and shows the remaining liker');
select is((select count(*)::int from public.activity where user_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'photo_like'), 1,
  'one row per photo');

-- ── broadcast: ids / kind only on the owner's private inbox topic ──
select ok((select count(*) from realtime.messages where topic = 'inbox:00000000-0000-0000-0000-0000000000c1' and event = 'activity') > 0,
  'changes are broadcast on the owner''s inbox topic, event activity');
select is((select count(*)::int from realtime.messages m, jsonb_object_keys(m.payload) k
  where m.event = 'activity' and k not in ('kind', 'id')), 0,
  'the broadcast carries the kind only (plus Realtime''s own message id)');
select is((select count(*)::int from realtime.messages where event = 'activity' and topic <> 'inbox:00000000-0000-0000-0000-0000000000c1'), 0,
  'nobody else''s topic is told about the owner''s likes');
select ok((select qual from pg_policies where schemaname = 'realtime' and policyname = 'dm_channel_receive') like '%inbox:%',
  'realtime: each fan receives only their own inbox topic');

-- ── trips: requests for the driver, acceptance for the rider ──
select pg_temp.as_fan('c2');
set local role authenticated;
insert into public.trip_requests (trip_id) select id from public.trips;
reset role;
select pg_temp.as_fan('c3');
set local role authenticated;
insert into public.trip_requests (trip_id) select id from public.trips;
reset role;
select pg_temp.as_fan('c4');
set local role authenticated;
insert into public.trip_requests (trip_id) select id from public.trips;
reset role;
select is(pg_temp.rows_of('trip_request'), 'c2:1,c3:1',
  'each request makes one row for the driver; a blocked fan''s request does not surface');
select is((select count(*)::int from public.activity where user_id <> '00000000-0000-0000-0000-0000000000c1'), 0,
  'requesters get nothing while pending');

select pg_temp.as_fan('c1');
set local role authenticated;
update public.trip_requests set status = 'accepted' where user_id = '00000000-0000-0000-0000-0000000000c2';
update public.trip_requests set status = 'declined' where user_id = '00000000-0000-0000-0000-0000000000c3';
reset role;
select results_eq($$ select right(user_id::text, 2), right(actor_id::text, 2), actor_count from public.activity where kind = 'trip_accepted' $$,
  $$ values ('c2'::text, 'c1'::text, 1) $$, 'acceptance makes one row for the rider, from the driver');
select is((select count(*)::int from public.activity where user_id = '00000000-0000-0000-0000-0000000000c3'), 0,
  'a declined rider gets nothing');
select is(pg_temp.rows_of('trip_request'), 'c2:1,c3:1', 'deciding does not add rows for the driver');

select pg_temp.as_fan('c1');
set local role authenticated;
update public.trip_requests set status = 'declined' where user_id = '00000000-0000-0000-0000-0000000000c2';
reset role;
select is((select count(*)::int from public.activity where kind = 'trip_accepted'), 0, 'an acceptance taken back disappears');
select pg_temp.as_fan('c1');
set local role authenticated;
update public.trip_requests set status = 'accepted' where user_id = '00000000-0000-0000-0000-0000000000c2';
reset role;
select is((select count(*)::int from public.activity where kind = 'trip_accepted'), 1, 'accepting again makes one row again');

select pg_temp.as_fan('c3');
set local role authenticated;
delete from public.trip_requests;
reset role;
select is(pg_temp.rows_of('trip_request'), 'c2:1', 'a withdrawn request disappears from the driver''s list');

-- ── badge ──
select pg_temp.as_fan('c1');
set local role authenticated;
select is(public.activity_unread_count(), 2, 'the badge counts the owner''s rows (photo like + request) before any visit');
select lives_ok($$ select public.mark_activity_seen((select min(updated_at) from public.activity)) $$,
  'the list marks seen up to the newest row it showed (here: only the older one)');
select is(public.activity_unread_count(), 1, 'a row updated after p_upto still counts as unread');
select lives_ok($$ select public.mark_activity_seen(clock_timestamp() + interval '1 day') $$, 'opening the list marks it seen');
select is(public.activity_unread_count(), 0, 'after opening the list the badge is empty');
select public.mark_activity_seen('2000-01-01');
select is(public.activity_unread_count(), 0, 'an older mark never moves the seen time backwards');
select is((select count(*)::int from public.activity_seen), 1, 'the fan reads their own seen time');
reset role;

select pg_temp.as_fan('c2');
set local role authenticated;
select lives_ok($$ select public.mark_activity_seen(clock_timestamp()) $$, 'another fan marks their own list seen');
select is((select count(*)::int from public.activity_seen), 1, 'a fan sees only their own seen row');
select is((select count(*)::int from public.activity), 1, 'a fan reads only their own activity (the acceptance)');
select is((select count(*)::int from public.activity where user_id = '00000000-0000-0000-0000-0000000000c1'), 0,
  'other fans cannot read the owner''s activity');

-- ── no client writes ──
select throws_ok($$ insert into public.activity (user_id, kind, trip_id, actor_id)
  select '00000000-0000-0000-0000-0000000000c1', 'trip_request', id, '00000000-0000-0000-0000-0000000000c2' from public.trips $$,
  '42501', null, 'fans cannot write activity rows');
select throws_ok($$ update public.activity set actor_count = 50 $$, '42501', null, 'fans cannot change activity rows');
select throws_ok($$ delete from public.activity $$, '42501', null, 'fans cannot delete activity rows');
select throws_ok($$ insert into public.activity_seen (user_id, seen_at) values ('00000000-0000-0000-0000-0000000000c1', now()) $$,
  '42501', null, 'fans cannot write seen times directly');

-- c2 likes the photo again (unlike, like): a new like after the owner's visit.
delete from public.team_photo_likes;
insert into public.team_photo_likes (photo_id) select id from public.team_photos;
reset role;
select pg_temp.as_fan('c1');
set local role authenticated;
select is(public.activity_unread_count(), 1,
  'a new like after the visit lights the badge again (the visit was clamped to the clock; another fan''s visit does not clear it)');
reset role;
-- A request left from a fan the owner blocked afterwards: the list hides it, so the badge does not count it.
insert into public.activity (user_id, kind, trip_id, requester_id, actor_id)
  select '00000000-0000-0000-0000-0000000000c1', 'trip_request', id, '00000000-0000-0000-0000-0000000000c4',
    '00000000-0000-0000-0000-0000000000c4' from public.trips;
select pg_temp.as_fan('c1');
set local role authenticated;
select is(public.activity_unread_count(), 1, 'a request from a blocked fan is not counted (the list hides it too)');
reset role;
delete from public.activity where requester_id = '00000000-0000-0000-0000-0000000000c4';

set local role anon;
select throws_ok($$ select public.activity_unread_count() $$, '42501', null, 'signed-out visitors have no badge');
select throws_ok($$ select public.mark_activity_seen(now()) $$, '42501', null, 'signed-out visitors cannot mark seen');
reset role;

-- ── the badge stops at 100 (shown as 99+) ──
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid, 'authenticated', 'authenticated', 'bulk' || g || '@test.local'
  from generate_series(1, 120) g;
insert into public.activity (user_id, kind, trip_id, requester_id, actor_id)
  select '00000000-0000-0000-0000-0000000000c5', 'trip_request', (select id from public.trips),
    ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid, ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid
  from generate_series(1, 120) g;
select pg_temp.as_fan('c5');
set local role authenticated;
select is(public.activity_unread_count(), 100, 'the badge count stops at 100');
reset role;

-- ── 60-day prune on write ──
insert into public.activity (user_id, kind, trip_id, requester_id, actor_id, created_at, updated_at)
  select '00000000-0000-0000-0000-0000000000c1', 'trip_request', id, '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c5',
    now() - interval '61 days', now() - interval '61 days' from public.trips;
select pg_temp.as_fan('c3');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips;
reset role;
select is((select count(*)::int from public.activity where updated_at < now() - interval '60 days'), 0,
  'rows older than 60 days are removed when new activity arrives');
select is(pg_temp.rows_of('clip_like'), 'c3:1', 'the new like is recorded');

-- ── a post liked before this feature existed: the first new like shows the full count ──
select pg_temp.as_fan('c1');
set local role authenticated;
insert into public.team_photos (media_path) values ('00000000-0000-0000-0000-0000000000c1/p2.jpg');
reset role;
create function pg_temp.photo2() returns text language sql as $$
  select coalesce(string_agg(coalesce(right(a.actor_id::text, 2), '?') || ':' || a.actor_count, ','), 'none')
  from public.activity a join public.team_photos t on t.id = a.photo_id
  where t.media_path = '00000000-0000-0000-0000-0000000000c1/p2.jpg'
$$;
alter table public.team_photo_likes disable trigger team_photo_likes_notify;
insert into public.team_photo_likes (photo_id, user_id)
  select t.id, u.id from public.team_photos t, (values
    ('00000000-0000-0000-0000-0000000000c1'::uuid), ('00000000-0000-0000-0000-0000000000c2'::uuid),
    ('00000000-0000-0000-0000-0000000000c3'::uuid), ('00000000-0000-0000-0000-0000000000c4'::uuid)) u(id)
  where t.media_path = '00000000-0000-0000-0000-0000000000c1/p2.jpg';
alter table public.team_photo_likes enable trigger team_photo_likes_notify;
select is(pg_temp.photo2(), 'none', 'old likes (from before the feature) made no row and lit no badge');
select pg_temp.as_fan('c6');
set local role authenticated;
insert into public.team_photo_likes (photo_id) select id from public.team_photos where media_path like '%/p2.jpg';
reset role;
select is(pg_temp.photo2(), 'c6:3',
  'the first new like counts every earlier like too (not the owner''s own, not a blocked fan''s)');
select pg_temp.as_fan('c2');
set local role authenticated;
delete from public.team_photo_likes where photo_id = (select id from public.team_photos where media_path like '%/p2.jpg');
reset role;
select is(pg_temp.photo2(), 'c6:2', 'an unlike gives the exact remaining count');

-- ── deleted accounts: two requesters of one trip at once, and the shown liker ──
select pg_temp.as_fan('c6');
set local role authenticated;
insert into public.trip_requests (trip_id) select id from public.trips;
reset role;
select pg_temp.as_fan('c7');
set local role authenticated;
insert into public.trip_requests (trip_id) select id from public.trips;
insert into public.team_photo_likes (photo_id) select id from public.team_photos where media_path like '%/p2.jpg';
reset role;
select lives_ok($$ delete from auth.users where id in ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000c7') $$,
  'two requesters of the same trip (one of them the shown liker) delete their accounts in one statement');
select is(pg_temp.rows_of('trip_request'), 'c2:1', 'their request rows are gone, the remaining request stays');
select is(pg_temp.photo2(), 'c3:1', 'the photo row shows a remaining liker with the right count');
select is((select count(*)::int from public.activity where actor_id is null), 0, 'no row is left without an actor');

select is((select provolatile::text from pg_proc where proname = 'activity_unread_count'), 'v',
  'the badge count is volatile (it reads the clock)');

-- ── a deleted post takes its row with it ──
select pg_temp.as_fan('c1');
set local role authenticated;
delete from public.clips;
reset role;
select is(pg_temp.rows_of('clip_like'), 'none', 'a deleted post removes its row');

select * from finish();
rollback;
