-- Crowd verdict queue: queued minute-60 cards open together; a queued poll blocked by cooldown does not stall the queue.
begin;
select plan(4);

insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (31, 383, 2026, 'R1', now() - interval '60 minutes', '2H', 604, 4486);

create function pg_temp.expire_all() returns void language sql as $$
  update public.match_polls set opens_at = now() - interval '2 minutes', closes_at = now() - interval '1 second'
  where fixture_id = 31 and closes_at > now()
$$;
create function pg_temp.open_kinds() returns text language sql as $$
  select string_agg(kind || coalesce(':' || voter_scope, ''), ',' order by voter_scope nulls first)
  from public.match_polls where fixture_id = 31 and closes_at > now()
$$;

-- a chat poll is open; both minute-60 cards arrive and wait
select public.crowd_open_poll(31, 'penalty', 'chat', 'פנדל?', '[{"id":"yes","emoji":"✅","label":"פנדל"}]', null, null);
set local role service_role;
select public.open_event_poll(31, 'sub60', 'חילוף: מי יוצא ומי נכנס?', '[{"id":"604:7","emoji":"7","label":"א"}]', '[{"id":"604:14","emoji":"14","label":"ב"}]', 'mta');
select public.open_event_poll(31, 'sub60', 'חילוף: מי יוצא ומי נכנס?', '[{"id":"4486:9","emoji":"9","label":"ג"}]', '[{"id":"4486:20","emoji":"20","label":"ד"}]', 'hta');
reset role;
select is((select count(*)::int from public.match_poll_queue where fixture_id = 31), 2, 'both cards wait for the open poll');

select pg_temp.expire_all();
set local role authenticated;
select lives_ok($$ select public.crowd_tick(31) $$, 'any signed-in fan may tick');
reset role;
select is(pg_temp.open_kinds(), 'sub60:hta,sub60:mta', 'one tick opens both queued minute-60 cards together');

-- a queued card hits the cooldown (a card opened < 3 min ago); the goal behind it must still open
select pg_temp.expire_all();
insert into public.match_polls (fixture_id, kind, question, options, source, opens_at, closes_at)
  values (31, 'card', 'x', '[{"id":"ok","emoji":"✅","label":"מוצדק"}]', 'event', now() - interval '1 minute', now() - interval '1 second');
insert into public.match_poll_queue (fixture_id, kind, source, payload) values
  (31, 'card', 'event', '{"question":"הכרטיס מוצדק?","options":[{"id":"ok","emoji":"✅","label":"מוצדק"}],"options_in":null,"scope":null}'),
  (31, 'goal', 'event', '{"question":"הגול חוקי?","options":[{"id":"ok","emoji":"✅","label":"חוקי"}],"options_in":null,"scope":null}');
select public.crowd_tick(31);
select is(pg_temp.open_kinds(), 'goal', 'a queued poll dropped by cooldown does not stall the next one');

select * from finish();
rollback;
