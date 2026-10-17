-- LOAD TEST ONLY: EXPLAIN (ANALYZE, BUFFERS) of the app's hot queries on the seeded local database, run as a seeded
-- fan under RLS (role authenticated + JWT claims), each inside a rolled-back transaction (writes leave nothing).
-- The selects mirror apps/web/src/features/**/server/queries.ts; PostgREST wraps them in a CTE, the plan is the same.
--   psql "$DB_URL" [-v i=<seeded fan number, default 500>] -f load/explain.sql
\set ON_ERROR_STOP off
\pset pager off
\timing off
\if :{?i}
\else
  \set i 500
\endif
-- The fan, the live match and that fan's next match (all from the seed's load.* tables).
select u.id as fan, u.team as fan_team, (select v from load.meta where k = 'live_fixture') as live,
       coalesce((select f.id from load.fixtures f where f.status = 'NS' and u.team in (f.home, f.away) order by f.kickoff limit 1), 0) as next,
       coalesce((select f.id from load.fixtures f where f.round = 11 and u.team in (f.home, f.away)), 0) as trips_fx
  from load.users u where u.i = :i \gset
\echo 'fan #' :i ' club ' :fan_team ' live ' :live ' next ' :next

\echo '### team chat: newest page (features/team-chat/server/queries.ts)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select id,user_id,nick,body,created_at,reply_to,reply_user,reply_nick,reply_body from public.team_messages
 order by created_at desc, id desc limit 50;
rollback;

\echo '### team chat: send (insert + every trigger: stamp, rate limit, moderation, reply, crowd war, broadcast)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
insert into public.team_messages (body) values ('[נתוני עומס] בדיקת תוכנית') returning id;
\echo '### team chat: send again in the same session (warm: moderation patterns already compiled)'
explain (analyze, buffers, costs off, summary on)
insert into public.team_messages (body) values ('[נתוני עומס] בדיקת תוכנית שנייה') returning id;
rollback;

\echo '### match room: newest page (features/match-room/server/queries.ts)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select id,user_id,nick,body,created_at,reply_to,reply_user,reply_nick,reply_body,side from public.match_messages
 where fixture_id = :live order by created_at desc, id desc limit 50;
rollback;

\echo '### match room: send during the live match (crowd keyword "גול" -> burst counter)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
insert into public.match_messages (fixture_id, body) values (:live, '[נתוני עומס] גול!') returning id;
rollback;

\echo '### Square: first page (features/square/server/queries.ts getSquareFeed)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select id,user_id,team_id,nick,media_path,kind,caption,tags,once,likes_count,respects_count,comments_count,views_count,created_at,expires_at,audience
  from public.clips where audience = 'all' order by created_at desc, id desc limit 20;
rollback;

\echo '### Square: keyset page 5 (cursor = 80th post)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
select created_at as c_at, id as c_id from public.clips where audience = 'all' and expires_at > now() order by created_at desc, id desc offset 80 limit 1 \gset
explain (analyze, buffers, costs off, summary on)
select id,likes_count,created_at from public.clips where audience = 'all'
   and (created_at < :'c_at' or (created_at = :'c_at' and id < :'c_id'))
 order by created_at desc, id desc limit 20;
rollback;

\echo '### Square: my likes of a page (decorate)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select clip_id from public.clip_likes where clip_id in (select id from public.clips where audience = 'all' order by created_at desc limit 20);
rollback;

\echo '### Square: like (insert + counter + activity + weekly likes triggers)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
select id as clip from public.clips where audience = 'all' and not once order by likes_count desc limit 1 \gset
delete from public.clip_likes where clip_id = :'clip';
explain (analyze, buffers, costs off, summary on)
insert into public.clip_likes (clip_id) values (:'clip');
rollback;

\echo '### home: hot in the Square (getHotClips, clips_hot_idx)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select id,likes_count from public.clips where once = false order by likes_count desc, created_at desc limit 8;
rollback;

\echo '### home: stories (getStories, with my clip_views embedded)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select c.id, (select count(*) from public.clip_views v where v.clip_id = c.id) as seen from public.clips c
 where c.team_id = (select public.my_team()) and c.once = false order by c.created_at desc, c.id desc limit 60;
rollback;

\echo '### home: player reviews RPC (home_player_reviews)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on) select * from public.home_player_reviews(5);
rollback;

\echo '### ratings: player_rating_stats without a filter (getSquadWithRatings, RLS limits to my club)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on) select player_id,sum,count from public.player_rating_stats;
rollback;

\echo '### home (service role, cached 1 min): home_active_fans'
begin; set local role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', true) \gset _
explain (analyze, buffers, costs off, summary on) select public.home_active_fans(:'fan_team');
rollback;

\echo '### home (service role, cached 5 min): home_fans_of_week'
begin; set local role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', true) \gset _
explain (analyze, buffers, costs off, summary on) select * from public.home_fans_of_week(:'fan_team');
rollback;

\echo '### inbox: my threads (features/dm/server/queries.ts getInbox)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select id,user_a,user_b,last_at,unread_a,unread_b,accepted_at,opened_by from public.dm_threads order by last_at desc limit 100;
rollback;

\echo '### inbox: one thread page (dm-thread.tsx)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
select id as thread from public.dm_threads order by last_at desc limit 1 \gset
explain (analyze, buffers, costs off, summary on)
select id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at,reply_to from public.dm_messages
 where thread_id = :'thread' order by created_at desc limit 50;
rollback;

\echo '### inbox: send a private message (ciphertext only; stamp + after triggers)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
select id as thread from public.dm_threads where accepted_at is not null order by last_at desc limit 1 \gset
explain (analyze, buffers, costs off, summary on)
insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
values (:'thread', 'loaddev0', 'AAAAAAAAAAAAAAAA', 'Y2lwaGVydGV4dC1zaGFwZWQtZHVtbXk=', '{"loaddev0":{"i":"x","w":"y"}}');
rollback;

\echo '### device keys of two fans (use-device-key.ts; policy calls private.can_dm per row)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
select case when user_a = :'fan' then user_b else user_a end as other from public.dm_threads order by last_at desc limit 1 \gset
explain (analyze, buffers, costs off, summary on)
select user_id,device_id,public_jwk,created_at from public.device_keys where user_id in (:'fan', :'other');
rollback;

\echo '### activity bell: unread count RPC + first page'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on) select public.activity_unread_count();
explain (analyze, buffers, costs off, summary on)
select id,kind,actor_id,actor_count,updated_at from public.activity where user_id = :'fan'
   and updated_at > now() - interval '60 days' order by updated_at desc, id desc limit 21;
rollback;

\echo '### crowd war totals of the next match'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on) select team_id,points from public.crowd_war_totals where fixture_id = :next;
rollback;

\echo '### fan card: my place in the club (me/server/queries.ts, count exact)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select count(*) from public.profiles where team_id = :'fan_team'
   and created_at <= (select created_at from public.profiles where user_id = :'fan');
rollback;

\echo '### predictions board of my club (top 20)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on)
select user_id,points,exact,played from public.prediction_totals where team_id = (select public.my_team()) and season = 2026
 order by points desc, exact desc limit 20;
explain (analyze, buffers, costs off, summary on)
select count(*) from public.prediction_totals where team_id = (select public.my_team()) and season = 2026;
rollback;

\echo '### stand home counts (stand-home/server/queries.ts: four count(*) exact)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, buffers, costs off, summary on) select count(*) from public.market_items where sold = false;
explain (analyze, buffers, costs off, summary on) select count(*) from public.trips where fixture_id = :next;
rollback;

\echo '### realtime authorisation: Realtime inserts a probe row and reads it back under RLS when a fan joins (dm: topic)'
begin;
select id as thread from public.dm_threads where user_a = :'fan' or user_b = :'fan' limit 1 \gset
insert into realtime.messages (topic, extension, payload, event, private) values ('dm:' || :'thread', 'broadcast', '{}', 'probe', true);
set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
select set_config('realtime.topic', 'dm:' || :'thread', true) \gset _
explain (analyze, buffers, costs off, summary on) select 1 from realtime.messages where topic = 'dm:' || :'thread' and extension = 'broadcast';
rollback;

-- ── What-if: proposed fixes, applied inside a transaction, measured on the same data, then rolled back ─────────
\echo '### WHAT-IF trips count today (per-row ride_suspended + ride_poster_ok in the restrictive policies)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, costs off, summary on) select count(*) from public.trips where fixture_id = :trips_fx;
\echo 'same answer? rows the fan sees:'
select count(*) as trips_visible from public.trips where fixture_id = :trips_fx;
rollback;
\echo '### WHAT-IF trips count with the policy functions evaluated once per query (same rules)'
begin;
create or replace function private.active_ride_suspensions() returns uuid[] language sql stable security definer set search_path = ''
  as $f$ select coalesce(array_agg(s.user_id), '{}') from public.ride_suspensions s where s.lifted_at is null $f$;
grant execute on function private.active_ride_suspensions() to authenticated;
create or replace function private.ride_verification_on() returns boolean language sql stable security definer set search_path = ''
  as $f$ select private.setting_on('rides_require_verification') $f$;
grant execute on function private.ride_verification_on() to authenticated;
alter policy trips_not_ride_suspended on public.trips
  using ((user_id = (select auth.uid())) or (select public.is_app_admin()) or user_id <> all (coalesce((select private.active_ride_suspensions()), '{}')));
alter policy trips_verified_or_hidden on public.trips
  using ((user_id = (select auth.uid())) or (select public.is_app_admin())
         or not (select private.ride_verification_on())
         or private.ride_poster_ok(user_id, kind) or private.accepted_on(id));
set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, costs off, summary on) select count(*) from public.trips where fixture_id = :trips_fx;
\echo 'same answer? rows the fan sees:'
select count(*) as trips_visible from public.trips where fixture_id = :trips_fx;
rollback;

\echo '### WHAT-IF home_player_reviews today (twice: cold, warm)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, costs off, summary on) select * from public.home_player_reviews(5);
\echo 'same answer? rows and a checksum of them:'
select count(*) as reviews, md5(string_agg(player_id || author_id || likes_count || liked, ',' order by player_id, author_id)) as checksum from public.home_player_reviews(5);
rollback;
\echo '### WHAT-IF home_player_reviews with the blocked fans read once (one definer helper) instead of per row'
begin;
create or replace function private.blocked_ids(p_me uuid) returns uuid[] language sql stable security definer set search_path = ''
  as $f$ select coalesce(array_agg(x), '{}') from (select b.blocked_id x from public.blocks b where b.user_id = p_me
                                                   union select b.user_id from public.blocks b where b.blocked_id = p_me) z $f$;
grant execute on function private.blocked_ids(uuid) to authenticated;
create or replace function public.home_player_reviews(p_per_player integer default 5)
 returns table(player_id text, author_id uuid, nick text, review text, stars smallint, likes_count integer, liked boolean, updated_at timestamptz)
 language sql stable set search_path = '' as $f$
  select t.player_id, t.user_id, t.nick::text, t.review::text, t.stars, t.likes_count,
         exists (select 1 from public.player_rating_likes l
                  where l.player_id = t.player_id and l.author_id = t.user_id and l.user_id = (select auth.uid())),
         t.updated_at
    from public.players pl
    cross join lateral (
      select x.player_id, x.user_id, x.nick, x.review, x.stars, x.likes_count, x.updated_at
        from public.player_ratings x
       where x.player_id = pl.id and x.review <> '' and x.updated_at > now() - interval '30 days'
         and x.user_id <> all (coalesce((select private.blocked_ids((select auth.uid()))), '{}'))
       order by x.likes_count desc, x.updated_at desc, x.user_id
       limit least(greatest(coalesce(p_per_player, 5), 1), 20)
    ) t
   where pl.team_id = (select public.my_team())
   order by t.player_id, t.likes_count desc, t.updated_at desc, t.user_id
$f$;
set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, costs off, summary on) select * from public.home_player_reviews(5);
\echo 'same answer? rows and a checksum of them:'
select count(*) as reviews, md5(string_agg(player_id || author_id || likes_count || liked, ',' order by player_id, author_id)) as checksum from public.home_player_reviews(5);
rollback;

\echo '### WHAT-IF my ratings today (player_ratings where user_id = me: no index on user_id)'
begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, costs off, summary on) select player_id, stars, review from public.player_ratings where user_id = :'fan';
rollback;
\echo '### WHAT-IF my ratings with an index on player_ratings (user_id)'
begin;
create index if not exists player_ratings_user_idx on public.player_ratings (user_id);
set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', :'fan', 'role', 'authenticated')::text, true) \gset _
explain (analyze, costs off, summary on) select player_id, stars, review from public.player_ratings where user_id = :'fan';
rollback;
