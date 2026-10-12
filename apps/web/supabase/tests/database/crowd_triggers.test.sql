-- Crowd verdict: polls open by themselves (chat bursts, events), one at a time, close once.
-- Note: now() is fixed for the whole transaction, so "expiring" a poll means moving its times back.
begin;
select plan(19);

select is(public.crowd_keyword('פנדלללל!!!'), 'penalty', 'repeated letters and punctuation are normalised');
select is(public.crowd_keyword('איזה PENALTY'), 'penalty', 'English variant');
select is(public.crowd_keyword('נבדל ברור'), 'offside', 'offside');
select is(public.crowd_keyword('יאללה מכבי'), null, 'ordinary message has no keyword');

-- 20 fans of the two clubs playing
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'authenticated', 'authenticated', 'b' || i || '@test.local'
  from generate_series(1, 20) i;
insert into public.profiles (user_id, nick, team_id)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'אוהד' || i, case when i <= 10 then 'mta' else 'hta' end
  from generate_series(1, 20) i;
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (21, 383, 2026, 'R1', now() - interval '50 minutes', '2H', 604, 4486);

create function pg_temp.fan(i int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
$$;
create function pg_temp.open_polls() returns int language sql as $$
  select count(*)::int from public.match_polls where fixture_id = 21 and closes_at > now()
$$;
create function pg_temp.expire_all() returns void language sql as $$
  update public.match_polls set opens_at = now() - interval '5 minutes', closes_at = now() - interval '1 second'
  where fixture_id = 21 and closes_at > now()
$$;

insert into public.match_messages (fixture_id, user_id, body) select 21, pg_temp.fan(i), 'פנדל!!' from generate_series(1, 14) i;
select is(pg_temp.open_polls(), 0, '14 fans are not a burst');
insert into public.match_messages (fixture_id, user_id, body) select 21, pg_temp.fan(1), 'פנדללל' from generate_series(1, 4);
select is(pg_temp.open_polls(), 0, 'one fan writing again is counted once');
insert into public.match_messages (fixture_id, user_id, body) values (21, pg_temp.fan(15), 'פנדל ברור');
select is((select kind || '/' || source from public.match_polls where fixture_id = 21), 'penalty/chat', 'the 15th fan opens a penalty poll');
select is((select closes_at - opens_at from public.match_polls where fixture_id = 21), interval '90 seconds', 'poll is open for 90 seconds');

insert into public.match_messages (fixture_id, user_id, body) select 21, pg_temp.fan(i), 'אדום!' from generate_series(2, 16) i;
select is(pg_temp.open_polls(), 1, 'a chat burst while a poll is open is dropped');

set local role service_role;
select is(public.open_event_poll(21, 'card', 'הכרטיס מוצדק?', '[{"id":"ok","emoji":"✅","label":"מוצדק"}]', null, null), null,
  'an event while a poll is open waits');
reset role;
select is((select count(*)::int from public.match_poll_queue where fixture_id = 21), 1, 'the event is queued');

set local role authenticated;
select throws_ok($$ select public.open_event_poll(21, 'card', 'x', '[]', null, null) $$, '42501', null, 'fans cannot open event polls');
reset role;

-- 3 × פנדל, 1 × לא, then the poll expires
insert into public.match_poll_votes (poll_id, user_id, option_id)
  select (select id from public.match_polls where kind = 'penalty'), pg_temp.fan(i), case when i <= 3 then 'yes' else 'no' end
  from generate_series(1, 4) i;
select pg_temp.expire_all();
select public.crowd_tick(21);
select public.crowd_tick(21);
select is((select summary from public.match_polls where kind = 'penalty'), '75% מהקהל: פנדל', 'closing writes one summary, ticking twice is harmless');
select is((select kind from public.match_polls where fixture_id = 21 and closes_at > now()), 'card', 'the queued event poll opens next');
select is((select count(*)::int from public.match_poll_queue where fixture_id = 21), 0, 'queue is empty');

select pg_temp.expire_all();
select public.crowd_tick(21);
select is(public.crowd_open_poll(21, 'penalty', 'chat', 'פנדל?', '[{"id":"yes","emoji":"✅","label":"פנדל"}]', null, null), null,
  'the same kind does not reopen within 3 minutes');
select isnt(public.crowd_open_poll(21, 'red', 'chat', 'מגיע אדום?', '[{"id":"red","emoji":"🟥","label":"אדום"}]', null, null), null,
  'another kind opens');

select pg_temp.expire_all();
set local role service_role;
select public.open_event_poll(21, 'sub60', 'חילוף: מי יוצא ומי נכנס?', '[{"id":"604:7","emoji":"7","label":"א"}]', '[{"id":"604:14","emoji":"14","label":"ב"}]', 'mta');
select public.open_event_poll(21, 'sub60', 'חילוף: מי יוצא ומי נכנס?', '[{"id":"4486:9","emoji":"9","label":"ג"}]', '[{"id":"4486:20","emoji":"20","label":"ד"}]', 'hta');
reset role;
select is(pg_temp.open_polls(), 2, 'both minute-60 cards open together');
select is((select count(*)::int from public.match_poll_queue where fixture_id = 21), 0, 'nothing was queued');

select * from finish();
rollback;
