-- Perf round 2 (migration 20261017120000_perf_round2, docs/perf-round-2.md): club-wide reads served once per club
-- from a shared cache with the service role. The premise checked here: the service role may read each cached table,
-- and what it reads for a club is exactly what every fan of that club reads under RLS (including the author of a
-- rating hidden by moderation, and a fan of another club for their own club).
begin;
select plan(9);

-- c1, c2 fans of mta (c2's rating is hidden by moderation), c3 a fan of hta.
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-0000000000' || x)::uuid, 'authenticated', 'authenticated', x || '@test.local'
  from unnest(array['c1', 'c2', 'c3']) x;
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'ראשון', 'mta'),
  ('00000000-0000-0000-0000-0000000000c2', 'שני', 'mta'),
  ('00000000-0000-0000-0000-0000000000c3', 'יריב', 'hta');

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000' || p, 'role', 'authenticated')::text, true)
$$;

insert into public.player_ratings (player_id, user_id, stars, review) values
  ('mta_1', '00000000-0000-0000-0000-0000000000c1', 4, ''),
  ('mta_14', '00000000-0000-0000-0000-0000000000c1', 2, ''),
  ('mta_1', '00000000-0000-0000-0000-0000000000c2', 5, ''),
  ('hta_1', '00000000-0000-0000-0000-0000000000c3', 3, '');
update public.player_ratings set hidden_at = now() where user_id = '00000000-0000-0000-0000-0000000000c2';

-- ── the service role may read every table it caches ──
select ok(has_table_privilege('service_role', 'public.player_rating_stats', 'select'), 'service role reads rating totals');
select ok(has_table_privilege('service_role', 'public.players', 'select'), 'service role reads squads (the join)');
select ok(has_table_privilege('service_role', 'public.match_rating_stats', 'select'), 'service role reads match rating totals');
select ok(has_table_privilege('service_role', 'public.fan_lineup_totals', 'select'), 'service role reads fan lineup totals');
select ok(has_table_privilege('service_role', 'public.fan_lineup_tallies', 'select'), 'service role reads fan lineup tallies');

-- ── the shared read (service role, filtered to the club) equals what each fan of the club reads under RLS ──
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select set_config('t.svc_mta', (
  select coalesce(string_agg(s.player_id || ':' || s.sum || ':' || s.count, ',' order by s.player_id), '')
  from public.player_rating_stats s join public.players p on p.id = s.player_id where p.team_id = 'mta'), true);
select set_config('t.svc_hta', (
  select coalesce(string_agg(s.player_id || ':' || s.sum || ':' || s.count, ',' order by s.player_id), '')
  from public.player_rating_stats s join public.players p on p.id = s.player_id where p.team_id = 'hta'), true);
reset role;

select is(current_setting('t.svc_mta'), 'mta_1:9:2,mta_14:2:1', 'the club read counts every rating, hidden ones included');

select pg_temp.as_fan('c1');
set local role authenticated;
select is((select coalesce(string_agg(player_id || ':' || sum || ':' || count, ',' order by player_id), '') from public.player_rating_stats),
  current_setting('t.svc_mta'), 'a fan of the club reads exactly the shared rows');
reset role;

select pg_temp.as_fan('c2');
set local role authenticated;
select is((select coalesce(string_agg(player_id || ':' || sum || ':' || count, ',' order by player_id), '') from public.player_rating_stats),
  current_setting('t.svc_mta'), 'the author of a hidden rating reads the same rows');
reset role;

select pg_temp.as_fan('c3');
set local role authenticated;
select is((select coalesce(string_agg(player_id || ':' || sum || ':' || count, ',' order by player_id), '') from public.player_rating_stats),
  current_setting('t.svc_hta'), 'a fan of another club reads exactly their club''s shared rows');
reset role;

select * from finish();
rollback;
