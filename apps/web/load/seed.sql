-- LOAD TEST DATA ONLY. Seeds a throwaway LOCAL Supabase (inside a GitHub Actions runner) with :users fake fans and a
-- realistic history, for .github/workflows/web-load-local.yml. Never run this against staging or production: the
-- workflow refuses any database that is not on 127.0.0.1, and this file refuses a database that has real fans.
--
-- Everything is labelled: nicknames "עומס·<n>", e-mails <n>@load.onefan.test, texts start with "[נתוני עומס]",
-- fixtures are is_demo, media paths are dummies (no files), private messages are random ciphertext-shaped strings
-- (there is no plaintext anywhere, as in the real app). Set-based (generate_series) so 50k fans seed in minutes.
-- Triggers are switched off while seeding (session_replication_role = replica); every counter they would keep is
-- computed set-based at the end, so the data is consistent when the load starts and the triggers take over.
--
--   psql "$DB_URL" -v users=50000 -f load/seed.sql
\set ON_ERROR_STOP on
\if :{?users}
\else
  \set users 50000
\endif
\timing on

-- Guards: only a database server on this machine's loopback or a local socket (the workflow runs this file inside the
-- local database container), and never one that already has fans (not ours).
do $$
begin
  if inet_server_addr() is not null and not (inet_server_addr() <<= '127.0.0.0/8'::inet or inet_server_addr() = '::1'::inet) then
    raise exception 'refusing to seed: the database server is at %, not on loopback or a local socket', inet_server_addr();
  end if;
  if exists (select 1 from auth.users where email not like '%@load.onefan.test') then
    raise exception 'refusing to seed: auth.users has accounts that are not load-test accounts';
  end if;
end $$;

begin;
-- No triggers while seeding: counters are computed below. A superuser (supabase_admin) skips them all with
-- session_replication_role; otherwise the user triggers of each public table are disabled until the end.
create temp table seed_mode (how text);
do $$
declare t regclass;
begin
  begin
    set local session_replication_role = replica;
    insert into seed_mode values ('replica');
  exception when insufficient_privilege then
    for t in select c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' loop
      execute format('alter table %s disable trigger user', t);
    end loop;
    insert into seed_mode values ('triggers disabled');
  end;
end $$;
select how as seed_mode from seed_mode;
set local statement_timeout = 0;
select setseed(0.42);

create schema if not exists load;
comment on schema load is 'LOAD TEST DATA ONLY (web-load-local.yml): helper tables for the seeded fake fans';
create table load.meta (k text primary key, v text not null);
insert into load.meta values ('users', :'users'), ('seeded_at', now()::text), ('label', 'נתוני עומס (בדיקת עומס מקומית)');
-- A non-negative deterministic hash (abs(hashint4) overflows on one value).
create function load.h(int) returns int language sql immutable parallel safe as $$ select hashint4($1) & 2147483647 $$;
-- A skewed pick in 1..n (k = 3: a few items get most of the picks). Volatile: used only in a select list.
create function load.skew(n int, k float8) returns int language sql volatile as $$ select 1 + floor(n * power(random(), k))::int $$;

-- ── Clubs and the league (14 clubs from the reference data migration) ─────────────────────────────────────────
-- Fans per club: big clubs bigger (shares in per mille, cumulative bounds).
create table load.clubs (team text primary key, sort int, api_id int, share int, lo int, hi int, n int default 0);
insert into load.clubs (team, sort, api_id, share)
select t.id, t.sort, 9000 + t.sort,
       case t.id when 'mta' then 160 when 'mhf' then 140 when 'bei' then 120 when 'hbs' then 100 when 'hta' then 90
                 else 43 end
  from public.teams t;
update load.clubs c set lo = x.lo, hi = x.hi from (
  select team, coalesce(sum(share) over (order by sort rows between unbounded preceding and 1 preceding), 0) as lo,
         sum(share) over (order by sort) as hi from load.clubs) x where x.team = c.team;

insert into public.api_teams (api_id, name, logo)
select c.api_id, t.api_names[1], '' from load.clubs c join public.teams t on t.id = c.team
on conflict (api_id) do update set name = excluded.name;

-- ── Fans ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Fans 1..20 are reserved for the UI consistency checks (k6 never acts as them): 1-8 mta, 9-14 hta, 15-20 bei.
create table load.users (i int primary key, id uuid not null unique, team text not null, r int, born date not null,
                         joined timestamptz not null);
insert into load.users (i, id, team, born, joined)
select g, md5('load-user-' || g)::uuid,
       case when g <= 8 then 'mta' when g <= 14 then 'hta' when g <= 20 then 'bei' else c.team end,
       -- ~10% are 16–17, the rest 18–60
       case when g % 10 = 3 then current_date - (16 * 365 + 30 + (g % 600)) * interval '1 day'
            else current_date - (18 * 366 + (load.h((g * 7)) % (42 * 365))) * interval '1 day' end,
       now() - interval '120 days' * random()
  from generate_series(1, :users) g
  join load.clubs c on load.h(g) % (select sum(share) from load.clubs) >= c.lo
                   and load.h(g) % (select sum(share) from load.clubs) < c.hi;
-- rank of a fan inside their club (1..n), for "a random fan of club X" joins
update load.users u set r = x.r from (select i, row_number() over (partition by team order by i) as r from load.users) x
 where x.i = u.i;
create index on load.users (team, r);
update load.clubs c set n = x.n from (select team, count(*) n from load.users group by team) x where x.team = c.team;
analyze load.users;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.i || '@load.onefan.test', '', u.joined, '{"provider":"email","providers":["email"]}', '{"load_test":true}',
       u.joined, u.joined
  from load.users u;
-- GoTrue reads these token columns as plain strings: NULL breaks GET /auth/v1/user, so they are '' (when present).
do $$
declare c text;
begin
  for c in select column_name from information_schema.columns
            where table_schema = 'auth' and table_name = 'users' and data_type in ('character varying', 'text')
              and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                                  'email_change_token_current', 'phone_change', 'phone_change_token',
                                  'reauthentication_token') loop
    execute format('update auth.users set %I = '''' where %I is null', c, c);
  end loop;
end $$;

insert into public.profiles (user_id, nick, team_id, created_at, terms_version, gender, birth_date, qr_code)
select u.id, 'עומס·' || u.i, u.team, u.joined, '2026-10-15',
       (array['m', 'm', 'm', 'f', 'x', null])[1 + u.i % 6], u.born, private.new_qr_code()
  from load.users u;
insert into public.team_stats (team_id, fans)
select team, n from load.clubs on conflict (team_id) do update set fans = excluded.fans;
-- One device key per fan (a dummy public key; private messages below are random ciphertext-shaped strings).
insert into public.device_keys (user_id, device_id, public_jwk, created_at)
select u.id, 'loaddev' || u.i, '{"kty":"EC","crv":"P-256","x":"load-' || u.i || '","y":"dummy"}', u.joined from load.users u;

-- ── Fixtures: 10 played rounds, the current round (one LIVE match now + six tomorrow), 5 rounds ahead ─────────────
-- Ids 990000000+ and is_demo: shown as "לדוגמה" by the app.
create table load.fixtures (id bigint primary key, round int, home text, away text, kickoff timestamptz, status text,
                            hg int, ag int);
do $$
declare
  t text[];
  n int;
  r int;
  k int;
  h text; a text;
  ko timestamptz;
  cur constant int := 11;            -- round 11 is the current one
begin
  select array_agg(team order by sort) into t from load.clubs;
  n := array_length(t, 1);
  for r in 1..16 loop
    for k in 0..(n / 2 - 1) loop
      if r = cur then
        h := t[2 * k + 1]; a := t[2 * k + 2];                  -- mta–hta, mhf–bei, ... (mta–hta is the live derby)
      else                                                     -- circle method for the other rounds
        h := t[1 + case when k = 0 then 0 else ((k + r - 1) % (n - 1)) + 1 end];
        a := t[1 + ((n - 1 - k + r - 1) % (n - 1)) + 1];
        if h = a then a := t[1 + ((n - 1 - k + r) % (n - 1)) + 1]; end if;
      end if;
      ko := case when r < cur then now() - (cur - r) * interval '7 days' + k * interval '2 hours'
                 when r = cur and k = 0 then now() - interval '45 minutes'
                 when r = cur then now() + interval '20 hours' + k * interval '30 minutes'
                 else now() + (r - cur) * interval '7 days' + k * interval '2 hours' end;
      insert into load.fixtures values (990000000 + r * 100 + k, r, h, a, ko,
        case when r < cur then 'FT' when r = cur and k = 0 then '2H' else 'NS' end,
        case when r < cur or (r = cur and k = 0) then load.h((r * 31 + k)) % 4 end,
        case when r < cur or (r = cur and k = 0) then load.h((r * 17 + k)) % 3 end);
    end loop;
  end loop;
end $$;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, elapsed, home_api_id, away_api_id,
                             home_goals, away_goals, venue, is_demo)
select f.id, 383, 2026, 'Regular Season - ' || f.round, f.kickoff, f.status,
       case f.status when 'FT' then 90 when '2H' then 60 end, h.api_id, a.api_id, f.hg, f.ag,
       'אצטדיון לדוגמה (נתוני עומס)', true
  from load.fixtures f join load.clubs h on h.team = f.home join load.clubs a on a.team = f.away;
insert into load.meta values
  ('live_fixture', (select id::text from load.fixtures where status = '2H')),
  ('live_home', (select home from load.fixtures where status = '2H')),
  ('live_away', (select away from load.fixtures where status = '2H'));
insert into public.standings (season, group_name, group_order, api_team_id, rank, points, played, won, drawn, lost,
                              gf, ga, gd, form, description)
select 2026, 'Ligat Ha''al', 1, c.api_id, row_number() over (order by c.sort), 30 - c.sort, 10, 9 - c.sort / 2, 1,
       c.sort / 2, 20 - c.sort, 5 + c.sort, 15 - 2 * c.sort, 'WWDLW', ''
  from load.clubs c;

-- ── Team chat: 20 messages per fan over 30 days (recent days busier) ─────────────────────────────────────────────
insert into public.team_messages (id, team_id, user_id, nick, body, created_at)
select gen_random_uuid(), u.team, u.id, 'עומס·' || u.i, '[נתוני עומס] הודעה ' || g,
       now() - interval '30 days' * power(random(), 2)
  from generate_series(1, :users * 20) g
  join load.users u on u.i = 1 + (load.h((g)) % :users);

-- ── Match rooms: 3,000 messages per played match, 15,000 so far in the live one ────────────────────────────────────
insert into public.match_messages (id, fixture_id, user_id, team_id, side, nick, body, created_at)
select gen_random_uuid(), f.id, u.id, u.team, case when u.team = f.home then 'h' else 'a' end, 'עומס·' || u.i,
       '[נתוני עומס] חדר המשחק ' || g,
       f.kickoff - interval '30 minutes' + least(now() - f.kickoff + interval '30 minutes', interval '150 minutes') * random()
  from load.fixtures f
  cross join lateral generate_series(1, case when f.status = 'FT' then (3000 * :users / 50000) when f.status = '2H'
                                             then (15000 * :users / 50000) else 0 end) g
  join load.clubs c on c.team = case when g % 2 = 0 then f.home else f.away end
  join load.users u on u.team = c.team and u.r = 1 + (load.h((g + f.id::int)) % c.n);

-- ── The Square: 8,000 live posts (24 h) + 1,000 just expired, likes / comments / views ─────────────────────────────
create table load.clips (n int primary key, id uuid not null, user_id uuid not null, team text not null);
insert into load.clips
select g, md5('load-clip-' || g)::uuid, u.id, u.team
  from generate_series(1, 9000 * :users / 50000) g join load.users u on u.i = 1 + (load.h((g * 13)) % :users);
-- fan 3 has five live posts (the bell check)
update load.clips set user_id = (select id from load.users where i = 3), team = 'mta' where n between 1 and 5;
insert into public.clips (id, user_id, team_id, nick, media_path, kind, caption, tags, once, audience, created_at,
                          expires_at)
select c.id, c.user_id, c.team, 'עומס·' || u.i, c.user_id || '/' || c.id || '.jpg',
       case when c.n % 5 = 0 then 'video' else 'image' end, '[נתוני עומס] פוסט ' || c.n, '#עומס',
       c.n % 20 = 7, case when c.n % 5 = 2 then 'team' else 'all' end, x.at, x.at + interval '24 hours'
  from load.clips c join load.users u on u.id = c.user_id
  cross join lateral (select case when c.n <= 8000 * :users / 50000 then now() - interval '23 hours' * random()
                                  else now() - interval '25 hours' - interval '50 minutes' * random() end as at) x;
-- Storage rows (no files) so the server can sign URLs exactly as in production.
do $$
begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  select 'clips', c.media_path, c.user_id, '{"mimetype":"image/jpeg","size":1,"load_test":true}' from public.clips c;
exception when others then
  raise notice 'storage.objects rows skipped: %', sqlerrm;
end $$;
-- likes: skewed (a few posts get thousands)
insert into public.clip_likes (clip_id, user_id)
select c.id, u.id
  from (select g, load.skew(9000 * :users / 50000, 3) as cn from generate_series(1, 8 * :users) g) s
  join load.clips c on c.n = s.cn
  join load.users u on u.i = 21 + (load.h((s.g)) % (:users - 20))
on conflict do nothing;
insert into public.clip_respects (clip_id, user_id)
select c.id, u.id
  from (select g, load.skew(9000 * :users / 50000, 2) as cn from generate_series(1, :users) g) s
  join load.clips c on c.n = s.cn
  join load.users u on u.i = 21 + (load.h((s.g * 3)) % (:users - 20)) and u.team <> c.team
on conflict do nothing;
insert into public.clip_views (clip_id, user_id, viewed_at)
select c.id, u.id, now() - interval '20 hours' * random()
  from (select g, load.skew(9000 * :users / 50000, 2) as cn from generate_series(1, 4 * :users) g) s
  join load.clips c on c.n = s.cn
  join load.users u on u.i = 21 + (load.h((s.g * 5)) % (:users - 20))
on conflict do nothing;
insert into public.clip_comments (id, clip_id, user_id, team_id, nick, body, created_at)
select gen_random_uuid(), c.id, u.id, u.team, 'עומס·' || u.i, '[נתוני עומס] תגובה ' || s.g, now() - interval '20 hours' * random()
  from (select g, load.skew(9000 * :users / 50000, 2) as cn from generate_series(1, (6 * :users) / 5) g) s
  join load.clips c on c.n = s.cn
  join load.users u on u.i = 1 + (load.h((s.g * 11)) % :users);
update public.clips c set likes_count = x.n from (select clip_id, count(*) n from public.clip_likes group by 1) x where x.clip_id = c.id;
update public.clips c set respects_count = x.n from (select clip_id, count(*) n from public.clip_respects group by 1) x where x.clip_id = c.id;
update public.clips c set comments_count = x.n from (select clip_id, count(*) n from public.clip_comments group by 1) x where x.clip_id = c.id;
update public.clips c set views_count = x.n from (select clip_id, count(*) n from public.clip_views group by 1) x where x.clip_id = c.id;
insert into public.clip_like_days (team_id, day, user_id, likes)
select c.team_id, (c.created_at at time zone 'Asia/Jerusalem')::date, c.user_id, sum(c.likes_count)
  from public.clips c where c.likes_count > 0 group by 1, 2, 3;
-- the bell: one row per liked post, for its owner
insert into public.activity (user_id, kind, clip_id, actor_id, actor_count, created_at, updated_at)
select c.user_id, 'clip_like', c.id, (select l.user_id from public.clip_likes l where l.clip_id = c.id limit 1),
       c.likes_count, c.created_at + interval '5 minutes', least(now(), c.created_at + interval '2 hours')
  from public.clips c where c.likes_count > 0;
insert into public.activity_seen (user_id, seen_at)
select u.id, now() - interval '3 hours' from load.users u where u.i % 2 = 0;

-- ── Ratings: each fan rated ~3 players of their club, a quarter with words; likes on reviews ───────────────────────
create table load.players as
select p.id, p.team_id as team, row_number() over (partition by p.team_id order by p.id) as k,
       count(*) over (partition by p.team_id) as n
  from public.players p where p.number is not null;
insert into public.player_ratings (player_id, user_id, stars, review, nick, updated_at)
select p.id, u.id, 1 + load.h((u.i * 3 + j)) % 5,
       case when (u.i + j) % 4 = 0 then '[נתוני עומס] ביקורת ' || u.i || '/' || j else '' end,
       'עומס·' || u.i, now() - interval '60 days' * random()
  from load.users u cross join generate_series(1, 3) j
  join load.players p on p.team = u.team and p.k = 1 + load.h((u.i * 7 + j * 101)) % p.n
on conflict do nothing;
insert into public.player_rating_likes (player_id, author_id, user_id, created_at)
select r.player_id, r.user_id, u.id, now() - interval '20 days' * random()
  from (select player_id, user_id, row_number() over () as k from public.player_ratings where review <> '') r
  cross join generate_series(1, 4) j
  join load.users a on a.id = r.user_id
  join load.clubs c on c.team = a.team
  join load.users u on u.team = a.team and u.r = 1 + load.h((r.k::int * 5 + j)) % c.n and u.id <> r.user_id
on conflict do nothing;
update public.player_ratings r set likes_count = x.n
  from (select player_id, author_id, count(*) n from public.player_rating_likes group by 1, 2) x
 where x.player_id = r.player_id and x.author_id = r.user_id;
insert into public.player_rating_stats (player_id, sum, count, d1, d2, d3, d4, d5)
select player_id, sum(stars), count(*), count(*) filter (where stars = 1), count(*) filter (where stars = 2),
       count(*) filter (where stars = 3), count(*) filter (where stars = 4), count(*) filter (where stars = 5)
  from public.player_ratings group by 1
on conflict (player_id) do update set sum = excluded.sum, count = excluded.count, d1 = excluded.d1,
  d2 = excluded.d2, d3 = excluded.d3, d4 = excluded.d4, d5 = excluded.d5;

-- ── Predictions: 40% of fans guess each match of their club; scored for played ones ────────────────────────────────
insert into public.predictions (user_id, fixture_id, team_id, home_goals, away_goals, points, exact, created_at, updated_at)
select u.id, f.id, u.team, x.hg, x.ag,
       case when f.status = 'FT' then case when x.hg = f.hg and x.ag = f.ag then 3
                                           when sign(x.hg - x.ag) = sign(f.hg - f.ag) then 1 else 0 end end,
       case when f.status = 'FT' then x.hg = f.hg and x.ag = f.ag end,
       f.kickoff - interval '2 days', f.kickoff - interval '1 day'
  from load.fixtures f
  join load.users u on u.team in (f.home, f.away) and load.h((u.i + f.id::int)) % 10 < 4
  cross join lateral (select load.h((u.i * 3 + f.id::int)) % 4 as hg, load.h((u.i * 5 + f.id::int)) % 3 as ag) x
 where f.status <> 'NS' or f.round = 11;
insert into public.prediction_totals (team_id, season, user_id, points, exact, played)
select p.team_id, 2026, p.user_id, sum(p.points), count(*) filter (where p.exact), count(*)
  from public.predictions p where p.points is not null group by 1, 2, 3;

-- ── Crowd war (the six matches tomorrow): fans who chatted / guessed in the last 48 h ─────────────────────────────
insert into public.crowd_war_fans (fixture_id, user_id, team_id, chat, posts, predicted, lineup)
select f.id, u.id, u.team, 1 + load.h((u.i)) % 20, load.h((u.i * 3)) % 4,
       exists (select 1 from public.predictions p where p.user_id = u.id and p.fixture_id = f.id), false
  from load.fixtures f join load.users u on u.team in (f.home, f.away) and load.h((u.i * 9)) % 5 = 0
 where f.round = 11 and f.status = 'NS';
insert into public.crowd_war_totals (fixture_id, team_id, points, fans)
select fixture_id, team_id, sum(points), count(*) from public.crowd_war_fans group by 1, 2;

-- ── Private messages: 2 threads per fan (70% same club), 6 messages each, ciphertext-shaped dummies only ───────────
-- Fans 1..20 only talk among themselves (fixed, known inbox for the UI check).
create table load.threads (id uuid primary key, a uuid, b uuid, opened uuid, accepted boolean, unique (a, b));
insert into load.threads           -- same club (70%)
select md5('load-thread-' || g)::uuid, least(x.id, y.id), greatest(x.id, y.id), x.id, g % 7 <> 0
  from generate_series(1, 2 * :users) g
  join load.users x on x.i = 21 + (load.h((g)) % (:users - 20))
  join load.clubs c on c.team = x.team
  join load.users y on y.team = x.team and y.r = 1 + load.h((g * 7)) % c.n
 where g % 10 < 7 and y.i > 20 and x.id <> y.id
on conflict do nothing;
insert into load.threads           -- across the league (30%)
select md5('load-thread-' || g)::uuid, least(x.id, y.id), greatest(x.id, y.id), x.id, g % 7 <> 0
  from generate_series(1, 2 * :users) g
  join load.users x on x.i = 21 + (load.h((g)) % (:users - 20))
  join load.users y on y.i = 21 + (load.h((g * 3)) % (:users - 20))
 where g % 10 >= 7 and x.id <> y.id
on conflict do nothing;
insert into public.dm_threads (id, user_a, user_b, nick_a, nick_b, team_a, team_b, created_at, last_at, opened_by,
                               accepted_at, via_qr)
select t.id, t.a, t.b, 'עומס·' || ua.i, 'עומס·' || ub.i, ua.team, ub.team, now() - interval '40 days',
       now() - interval '30 days', t.opened, case when t.accepted then now() - interval '39 days' end, false
  from load.threads t join load.users ua on ua.id = t.a join load.users ub on ub.id = t.b;
insert into public.dm_messages (id, thread_id, sender_id, sender_device, iv, ciphertext, wrapped_keys, created_at)
select gen_random_uuid(), t.id, s.sender, 'loaddev' || s.i, substr(md5(t.id::text || j), 1, 16),
       encode(sha256((t.id::text || j)::bytea), 'base64') || encode(sha256((j || t.id::text)::bytea), 'base64'),
       jsonb_build_object('loaddev' || ua.i, jsonb_build_object('i', substr(md5(j || 'a'), 1, 16), 'w', md5(t.id::text || 'wa')),
                          'loaddev' || ub.i, jsonb_build_object('i', substr(md5(j || 'b'), 1, 16), 'w', md5(t.id::text || 'wb'))),
       now() - interval '30 days' + j * interval '4 days' * random()
  from load.threads t join load.users ua on ua.id = t.a join load.users ub on ub.id = t.b
  cross join generate_series(1, 6) j
  cross join lateral (select case when not t.accepted or j % 2 = 1 then t.opened
                                  else case when t.opened = t.a then t.b else t.a end end as sender) x
  cross join lateral (select x.sender, case when x.sender = t.a then ua.i else ub.i end as i) s
 where t.accepted or j = 1;

-- Reserved fans' inbox (fan 4, mta): chats with 5, 6 (mta) and 9 (hta), an outgoing request to 16, an incoming request
-- from 15 (with a message) and one from 17 without a message (hidden), plus a group with 5 and 6.
insert into public.dm_threads (id, user_a, user_b, nick_a, nick_b, team_a, team_b, created_at, last_at, opened_by, accepted_at, via_qr)
select md5('load-r-thread-' || o.i)::uuid, least(me.id, o.id), greatest(me.id, o.id),
       case when me.id < o.id then 'עומס·4' else 'עומס·' || o.i end, case when me.id < o.id then 'עומס·' || o.i else 'עומס·4' end,
       case when me.id < o.id then me.team else o.team end, case when me.id < o.id then o.team else me.team end,
       now() - interval '2 days', now() - interval '1 hour' * o.i, case when o.i in (15, 17) then o.id else me.id end,
       case when o.i in (5, 6, 9) then now() - interval '2 days' end, false
  from load.users me join load.users o on o.i in (5, 6, 9, 15, 16, 17) where me.i = 4;
insert into public.dm_messages (id, thread_id, sender_id, sender_device, iv, ciphertext, wrapped_keys, created_at)
select md5('load-r-msg-' || o.i || '-' || j)::uuid, md5('load-r-thread-' || o.i)::uuid,
       case when o.i in (5, 9, 15) then o.id when o.i = 16 then me.id else case when j = 1 then me.id else o.id end end,
       'loaddev' || o.i, substr(md5(o.i || 'iv' || j), 1, 16), encode(sha256((o.i || 'ct' || j)::bytea), 'base64'),
       jsonb_build_object('loaddev4', jsonb_build_object('i', 'x', 'w', 'y')), now() - interval '1 hour' * o.i - interval '1 minute' * (5 - j)
  from load.users me join load.users o on o.i in (5, 6, 9, 15, 16) cross join generate_series(1, 3) j
 where me.i = 4 and (o.i in (5, 6, 9) or j = 1);

-- Groups: one per 50 fans, 8 members of the same club, 20 messages each
create table load.groups (n int primary key, id uuid, team text, admin uuid);
insert into load.groups
select g, md5('load-group-' || g)::uuid, u.team, u.id
  from generate_series(1, :users / 50) g join load.users u on u.i = 21 + load.h((g * 17)) % (:users - 20);
insert into load.groups values (0, md5('load-r-group')::uuid, 'mta', (select id from load.users where i = 4));
insert into public.dm_groups (id, team_id, name, created_by, created_at, last_at, members_count)
select g.id, g.team, case when g.n = 0 then 'קבוצה (נתוני עומס)' else 'עומס קבוצה ' || g.n end, g.admin,
       now() - interval '20 days', now() - interval '10 days', 0
  from load.groups g;
insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at, joined_at, unread)
select g.id, g.admin, 'admin', g.admin, now() - interval '20 days', now() - interval '20 days', 0 from load.groups g;
insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at, joined_at, unread)
select g.id, u.id, 'member', g.admin, now() - interval '20 days', now() - interval '20 days', load.h((u.i + g.n)) % 3
  from load.groups g join load.clubs c on c.team = g.team cross join generate_series(1, 7) j
  join load.users u on u.team = g.team and u.r = 1 + load.h((g.n * 31 + j)) % c.n
 where g.n > 0 and u.i > 20
on conflict do nothing;
insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at, joined_at, unread)
select g.id, u.id, 'member', g.admin, now() - interval '20 days', now() - interval '20 days', 0
  from load.groups g join load.users u on u.i in (5, 6) where g.n = 0;
update public.dm_group_members set unread = 3 where group_id = md5('load-r-group')::uuid and user_id = md5('load-user-4')::uuid;
update public.dm_group_members set unread = 0 where group_id = md5('load-r-group')::uuid and user_id <> md5('load-user-4')::uuid;
insert into public.dm_group_messages (id, group_id, sender_id, sender_device, iv, ciphertext, wrapped_keys, created_at)
select gen_random_uuid(), m.group_id, m.user_id, 'loaddevg', substr(md5(m.group_id::text || j), 1, 16),
       encode(sha256((m.group_id::text || m.user_id::text || j)::bytea), 'base64'),
       jsonb_build_object('loaddevg', jsonb_build_object('i', 'x', 'w', 'y')), now() - interval '10 days' * random()
  from public.dm_group_members m cross join generate_series(1, 3) j;
update public.dm_groups g set members_count = x.n from
  (select group_id, count(*) n from public.dm_group_members where role in ('admin', 'member') group by 1) x
 where x.group_id = g.id;
update public.dm_groups g set last_at = x.created_at, last_from = x.sender_id, last_message_id = x.id from
  (select distinct on (group_id) group_id, created_at, sender_id, id from public.dm_group_messages
    order by group_id, created_at desc) x
 where x.group_id = g.id;
-- thread previews and unread counters as the after-insert trigger keeps them
update public.dm_threads t set last_at = x.created_at, last_from = x.sender_id, last_message_id = x.id,
       unread_a = case when x.sender_id = t.user_b then 1 + load.h((hashtext(t.id::text))) % 3 else 0 end,
       unread_b = case when x.sender_id = t.user_a then 1 + load.h((hashtext(t.id::text))) % 3 else 0 end
  from (select distinct on (thread_id) thread_id, created_at, sender_id, id from public.dm_messages
         order by thread_id, created_at desc) x
 where x.thread_id = t.id;
-- fan 4's unread: 2 from fan 5, 1 from fan 9, 1 on the incoming request from 15
update public.dm_threads t set unread_a = case when t.user_a = me.id then u.n else t.unread_a end,
                               unread_b = case when t.user_b = me.id then u.n else t.unread_b end
  from load.users me, (values (5, 2), (6, 0), (9, 1), (15, 1), (16, 0)) u(i, n)
 where me.i = 4 and t.id = md5('load-r-thread-' || u.i)::uuid;

-- ── Blocks (none involving fans 1..20) ─────────────────────────────────────────────────────────────────────────────
insert into public.blocks (user_id, blocked_id, created_at)
select a.id, b.id, now() - interval '30 days' * random()
  from generate_series(1, (2 * :users) / 5) g
  join load.users a on a.i = 21 + load.h((g)) % (:users - 20)
  join load.users b on b.i = 21 + load.h((g * 7)) % (:users - 20)
 where a.id <> b.id
on conflict do nothing;

-- ── Team life: trips to tomorrow's matches, events, market, chants ─────────────────────────────────────────────────
insert into public.trips (id, team_id, user_id, nick, fixture_id, kind, from_city, depart_before_min, seats, cost, note,
                          pickup, created_at)
select gen_random_uuid(), u.team, u.id, 'עומס·' || u.i, f.id, (array['offer', 'seek', 'meet'])[1 + g % 3],
       (array['חיפה', 'תל אביב', 'באר שבע', 'ירושלים', 'נתניה'])[1 + g % 5], 120, case when g % 3 = 0 then 3 else 0 end,
       'share', '[נתוני עומס] נסיעה', 'תחנה מרכזית', now() - interval '1 day' * random()
  from generate_series(1, (2000 * :users) / 50000) g
  join load.users u on u.i = 21 + load.h((g * 19)) % (:users - 20)
  join load.fixtures f on f.round = 11 and u.team in (f.home, f.away);
insert into public.fan_events (id, team_id, user_id, nick, kind, title, starts_at, area, note, created_at)
select gen_random_uuid(), u.team, u.id, 'עומס·' || u.i, 'meet', '[נתוני עומס] מפגש ' || g, now() + interval '3 days',
       'מרכז', '', now() - interval '2 days'
  from generate_series(1, (500 * :users) / 50000) g join load.users u on u.i = 21 + load.h((g * 23)) % (:users - 20);
insert into public.market_items (id, team_id, user_id, nick, category, title, condition, price, created_at)
select gen_random_uuid(), u.team, u.id, 'עומס·' || u.i, 'shirt', 'חולצה ' || g || ' (עומס)', 'used', 100, now() - interval '5 days'
  from generate_series(1, (1000 * :users) / 50000) g join load.users u on u.i = 21 + load.h((g * 29)) % (:users - 20);
insert into public.reports (id, reporter_id, kind, ref, reason, note, created_at)
select gen_random_uuid(), u.id, 'team_message', m.id::text, 'ספאם', '[נתוני עומס]', now() - interval '3 days' * random()
  from (select id, row_number() over () k from public.team_messages limit (2000 * :users) / 50000) m
  join load.users u on u.i = 21 + load.h((m.k::int)) % (:users - 20);

do $$
declare t regclass;
begin
  if (select how from seed_mode) = 'triggers disabled' then
    for t in select c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' loop
      execute format('alter table %s enable trigger user', t);
    end loop;
  end if;
end $$;
grant usage on schema load to postgres;
grant all on all tables in schema load to postgres;
commit;

-- Planner statistics for the fresh data (as after a real day of autovacuum).
vacuum analyze;

select 'seeded' as status,
       (select count(*) from auth.users) as fans,
       (select count(*) from public.team_messages) as team_messages,
       (select count(*) from public.match_messages) as match_messages,
       (select count(*) from public.clips) as clips,
       (select count(*) from public.clip_likes) as clip_likes,
       (select count(*) from public.player_ratings) as ratings,
       (select count(*) from public.predictions) as predictions,
       (select count(*) from public.dm_threads) as dm_threads,
       (select count(*) from public.dm_messages) as dm_messages,
       (select count(*) from public.blocks) as blocks;
