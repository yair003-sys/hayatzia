-- Notifications: per-fan settings, goal / full-time alerts written by a trigger on fixtures (no duplicates,
-- no backfill floods), who receives them, message-push filtering, and the dispatch claim.
begin;
select plan(48);

-- n1 mta (row 'all'), n2 hta ('team'), n3 mhf ('team'), n4 bei ('off', messages off), n5 mhf (no row),
-- n6 mta (no row, no device). Everyone but n6 has a push device.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'e1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'e2@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'e3@test.local'),
  ('00000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'e4@test.local'),
  ('00000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated', 'e5@test.local'),
  ('00000000-0000-0000-0000-0000000000e6', 'authenticated', 'authenticated', 'e6@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000e2', 'אדום', 'hta'),
  ('00000000-0000-0000-0000-0000000000e3', 'ירוק', 'mhf'),
  ('00000000-0000-0000-0000-0000000000e4', 'שקט', 'bei'),
  ('00000000-0000-0000-0000-0000000000e5', 'חדש', 'mhf'),
  ('00000000-0000-0000-0000-0000000000e6', 'בלי', 'mta');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  select ('00000000-0000-0000-0000-0000000000e' || i)::uuid, 'https://fcm.googleapis.com/n' || i, 'k', 'a' from generate_series(1, 5) i;
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv')
  on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id, home_goals, away_goals) values
  (71, 383, 2026, 'R1', now() - interval '30 minutes', '1H', 604, 4486, 0, 0),     -- live
  (72, 383, 2025, 'R1', now() - interval '5 hours', 'NS', 604, 4486, null, null),  -- old match, backfilled late
  (73, 383, 2026, 'R1', now() - interval '20 minutes', '1H', 4486, 604, null, null), -- live, no score yet
  (75, 383, 2026, 'R1', now() - interval '3 hours', 'FT', 604, 4486, 5, 5),        -- holds a stale backlog
  (76, 383, 2026, 'R1', now() - interval '2 hours', '2H', 604, 4486, 0, 0),        -- last goal and full time together
  (77, 383, 2026, 'R1', now() - interval '2 hours', 'FT', 604, 4486, 1, 0);        -- already finished
-- A backlog of unsent alerts from 31+ minutes ago, older (lower ids) than every alert below.
insert into public.match_alerts (fixture_id, kind, home_goals, away_goals, created_at)
  select 75, 'goal', g, 0, now() - interval '31 minutes' from generate_series(1, 3) g;

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;

-- ── settings: own row only, defaults all / on ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select lives_ok($$ insert into public.notification_prefs default values $$, 'a fan saves settings');
select is((select matches || ':' || messages from public.notification_prefs), 'all:true', 'defaults: every league match, messages on');
select throws_ok($$ insert into public.notification_prefs (user_id) values ('00000000-0000-0000-0000-0000000000e2') $$,
  '42501', null, 'cannot save settings for someone else');
select throws_ok($$ update public.notification_prefs set matches = 'some' $$, '23514', null, 'matches is all / team / off');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select lives_ok($$ insert into public.notification_prefs (matches) values ('team') $$, 'a fan picks "my club only"');
select is((select count(*)::int from public.notification_prefs), 1, 'nobody sees another fan''s settings');
select is((select count(*)::int from public.notification_prefs where user_id = '00000000-0000-0000-0000-0000000000e1'), 0,
  'the other fan''s row is hidden');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
select lives_ok($$ insert into public.notification_prefs (matches) values ('team') $$, 'n3 picks my club only');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000e4');
set local role authenticated;
select lives_ok($$ insert into public.notification_prefs (matches) values ('team') $$, 'n4 saves');
select lives_ok($$ update public.notification_prefs set matches = 'off', messages = false $$, 'a fan turns everything off');
select is((select matches || ':' || messages from public.notification_prefs), 'off:false', 'the change is saved');
select throws_ok($$ update public.notification_prefs set user_id = '00000000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'cannot move the row to someone else');

-- ── alerts are server-only ──
select throws_ok($$ select count(*) from public.match_alerts $$, '42501', null, 'fans cannot read the alert queue');
select throws_ok($$ select public.alert_recipients(71) $$, '42501', null, 'fans cannot list recipients');
select throws_ok($$ select public.claim_alerts(10) $$, '42501', null, 'fans cannot claim alerts');
select throws_ok($$ select public.message_push_allowed(array['00000000-0000-0000-0000-0000000000e1']::uuid[]) $$,
  '42501', null, 'fans cannot query message settings');
reset role;
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and policyname = 'alerts_channel_receive' and 'authenticated' = any (roles) and qual like '%alerts%'),
  'realtime: signed-in fans receive the alerts topic');
select ok((select qual from pg_policies where schemaname = 'realtime' and policyname = 'dm_channel_receive') like '%inbox:%',
  'realtime: the private message channels are untouched');

-- ── goals ──
update public.fixtures set home_goals = 1, elapsed = 12 where id = 71;
select results_eq($$ select kind, home_goals::int, away_goals::int, scoring_api_id from public.match_alerts where fixture_id = 71 $$,
  $$ values ('goal'::text, 1, 0, 604) $$, 'a home goal makes one alert with the scoring club');
update public.fixtures set elapsed = 13 where id = 71;
select is((select count(*)::int from public.match_alerts where fixture_id = 71), 1, 'a minute tick is not a goal');
-- VAR: 1:0 → 0:0 → 1:0
update public.fixtures set home_goals = 0 where id = 71;
select is((select count(*)::int from public.match_alerts where fixture_id = 71), 1, 'a disallowed goal adds nothing and deletes nothing');
update public.fixtures set home_goals = 1 where id = 71;
select is((select count(*)::int from public.match_alerts where fixture_id = 71 and kind = 'goal'), 1,
  'VAR 1:0 → 0:0 → 1:0 is still exactly one goal alert');
update public.fixtures set away_goals = 1 where id = 71;
select is((select scoring_api_id from public.match_alerts where fixture_id = 71 and home_goals = 1 and away_goals = 1), 4486,
  'an away goal names the away club');
update public.fixtures set home_goals = 3, away_goals = 2 where id = 71;
select results_eq($$ select home_goals::int, away_goals::int, scoring_api_id from public.match_alerts where fixture_id = 71 and id = (select max(id) from public.match_alerts where fixture_id = 71) $$,
  $$ values (3, 2, null::int) $$, 'several goals on both sides between two updates: one alert for the new score');
select is((select count(*)::int from public.match_alerts where fixture_id = 71 and kind = 'goal'), 3, 'goal alerts so far: 1:0, 1:1, 3:2');
update public.fixtures set home_goals = 1 where id = 73;
select results_eq($$ select kind, home_goals::int, away_goals::int, scoring_api_id from public.match_alerts where fixture_id = 73 $$,
  $$ values ('goal'::text, 1, 0, 4486) $$, 'from no score to 1:0 is a goal');

-- ── full time ──
update public.fixtures set status = 'FT' where id = 71;
select results_eq($$ select kind, home_goals::int, away_goals::int, scoring_api_id from public.match_alerts where fixture_id = 71 and kind = 'ft' $$,
  $$ values ('ft'::text, 3, 2, null::int) $$, 'full time makes one alert with the final score');
update public.fixtures set status = 'AET' where id = 71;
update public.fixtures set updated_at = now() where id = 71;
select is((select count(*)::int from public.match_alerts where fixture_id = 71 and kind = 'ft'), 1, 'a finished match is announced once');
select is((select count(*)::int from realtime.messages where topic = 'alerts' and event = 'alert'
  and (payload ->> 'fixture_id')::bigint = 71), 4, 'every new alert is broadcast once on the alerts topic');

update public.fixtures set home_goals = 1, status = 'FT' where id = 76;
select results_eq($$ select kind, home_goals::int, away_goals::int from public.match_alerts where fixture_id = 76 order by id $$,
  $$ values ('goal'::text, 1, 0), ('ft'::text, 1, 0) $$, 'the last goal and full time in one update: the goal, then full time');
update public.fixtures set home_goals = 2 where id = 77;
update public.fixtures set status = 'AET' where id = 77;
select is((select count(*)::int from public.match_alerts where fixture_id = 77), 0,
  'a score corrected after full time is not a goal, and a finished match is not finished again');

-- ── no flood from old matches or first ingest ──
update public.fixtures set home_goals = 3, away_goals = 0, status = 'FT' where id = 72;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id, home_goals, away_goals)
  values (74, 383, 2026, 'R2', now() - interval '1 hour', '2H', 604, 4486, 2, 0);
select is((select count(*)::int from public.match_alerts where fixture_id in (72, 74)), 0,
  'a match that kicked off 5 hours ago and a first insert stay silent');

-- ── recipients ──
set local role service_role;
select set_eq($$ select * from public.alert_recipients(71) $$,
  array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e5']::uuid[],
  '"all" and no settings get every match; "team" only their club''s; "off" and fans without a device get nothing');
select ok(not exists (select 1 from public.alert_recipients(71) r where r = '00000000-0000-0000-0000-0000000000e4'),
  'a fan with matches off never gets a match push');
select ok(not exists (select 1 from public.alert_recipients(71) r where r = '00000000-0000-0000-0000-0000000000e3'),
  '"my club only" skips other clubs'' matches');
select results_eq($$ select * from public.alert_recipients(71, null, 2) $$,
  array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2']::uuid[],
  'recipients come in pages ordered by fan id');
select results_eq($$ select * from public.alert_recipients(71, '00000000-0000-0000-0000-0000000000e2', 2) $$,
  array['00000000-0000-0000-0000-0000000000e5']::uuid[],
  'the next page starts after the last fan of the previous one');
select is_empty($$ select * from public.alert_recipients(71, '00000000-0000-0000-0000-0000000000e5', 2) $$,
  'after the last fan there is nothing more');
select is((select count(*)::int from public.alert_recipients(71, null, 0)), 1, 'a page has at least one and at most 1000 fans');
select set_eq($$ select * from public.message_push_allowed(array['00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e6']::uuid[]) $$,
  array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e6']::uuid[],
  'message pushes skip fans who turned messages off');

-- ── claim ──
reset role;
create temp table c1 as select * from public.claim_alerts(2);
select is((select count(*)::int from c1), 2, 'a claim takes fresh alerts');
select is((select count(*)::int from c1 where fixture_id = 75), 0, 'an older stale backlog never takes the place of fresh goals');
select is((select count(*)::int from public.match_alerts where fixture_id = 75 and sent_at is null), 0,
  'stale alerts are marked sent without being claimed (no push)');
-- Security review 2026-10-17: claiming takes a lease (claimed_at); the alert is marked sent only after a successful
-- send (mark_alerts_sent), so a cut-off dispatch loses nothing and a leased alert is not re-claimed meanwhile.
select is((select count(*)::int from c1 where claimed_at is not null and sent_at is null), 2, 'claiming leases the alerts, not marks them sent');
set local role service_role;
select is((select count(*)::int from public.claim_alerts(50)), 5, 'the next claim gets only the rest (leased rows are skipped)');
select is((select count(*)::int from public.claim_alerts(50)), 0, 'nothing is claimed twice while the lease holds');
reset role;
-- mark_alerts_sent is run here as the superuser (it reads the temp table c1); it is granted to service_role in production.
select lives_ok($$ select public.mark_alerts_sent((select array_agg(id) from c1)) $$, 'the dispatch marks delivered after a successful send');
select is((select count(*)::int from c1 c join public.match_alerts m on m.id = c.id where m.sent_at is not null), 2,
  'the two leased alerts are now marked sent');

select * from finish();
rollback;
