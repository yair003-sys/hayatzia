-- Review of the load-test performance fixes (20261017090000_perf_fixes), 2026-10-17. Tests:
-- tests/database/perf_fixes.test.sql.
--
-- IMPORTANT: the `private` schema must never be in the API's exposed schemas (Supabase dashboard → API → exposed
-- schemas; locally `[api] schemas` in supabase/config.toml). Its definer helpers (active_ride_suspensions,
-- my_blocked_ids, crowd_try_lock, crowd_tick_work, …) are granted to `authenticated` only so that row rules and
-- triggers can call them; exposed, any fan could call them directly. anon has no usage on the schema at all
-- (pgTAP checks it).
--
-- Engineering calls:
-- 1. crowd_tick, as called by a fan (the `tickAction` RPC, when a poll's countdown ends), is gated so that a fan
--    looping it cannot hold the match's crowd lock and make the chat trigger skip its poll bookkeeping:
--    - at most one call per fan per match every 2 seconds (the app calls it once per poll per fan);
--    - it does the work only when there is work: an expired poll without a summary, or a queued poll that may open
--      now. Otherwise it returns without touching the lock;
--    - it never waits for the lock (try-lock): another tick holding it is doing the same work.
--    Calls from the database itself (the chat trigger, open_event_poll for the service role, jobs) are not gated.
--    A gated call that does nothing is not an error (the work is idempotent and the next tick does it).
-- 2. trip_requests_not_ride_suspended reads the active suspensions once per query, like the trips rule.

-- ---------- 1. crowd_tick gate ----------
create table private.crowd_tick_calls (
  user_id     uuid not null,
  fixture_id  bigint not null,
  at          timestamptz not null,
  primary key (user_id, fixture_id)
);
alter table private.crowd_tick_calls enable row level security;  -- no policies: written by crowd_tick only
revoke all on private.crowd_tick_calls from public, anon, authenticated;

-- The work itself, unchanged from 20261012043000_crowd_tick_queue (closes expired polls once, then opens queued ones).
create function private.crowd_tick_work(p_fixture bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p     record;
  s     text;
  tot   bigint;
  top   record;
  topin record;
  q     public.match_poll_queue;
begin
  perform pg_advisory_xact_lock(hashtext('crowd:' || p_fixture));
  for p in select * from public.match_polls m where m.fixture_id = p_fixture and m.closes_at <= now() and m.summary is null loop
    select coalesce(sum(t.n), 0) into tot from public.match_poll_tallies t where t.poll_id = p.id and t.row_kind = 'o';
    select t.option_id, sum(t.n) as n into top from public.match_poll_tallies t
      where t.poll_id = p.id and t.row_kind = 'o' group by t.option_id order by sum(t.n) desc, t.option_id limit 1;
    if p.kind = 'sub60' then
      select t.option_id into topin from public.match_poll_tallies t
        where t.poll_id = p.id and t.row_kind = 'i' group by t.option_id order by sum(t.n) desc, t.option_id limit 1;
      s := 'קהל ' || coalesce((select te.short from public.teams te where te.id = p.voter_scope), '') || ': ' ||
        case when tot = 0 then 'אין הצבעות'
             else 'להוציא את ' || (select o ->> 'label' from jsonb_array_elements(p.options) o where o ->> 'id' = top.option_id) ||
                  ' ולהכניס את ' || coalesce((select o ->> 'label' from jsonb_array_elements(p.options_in) o where o ->> 'id' = topin.option_id), '—')
        end;
    elsif tot = 0 then
      s := 'אף אחד לא הצביע';
    else
      s := round(100.0 * top.n / tot)::int || '% מהקהל: ' ||
           (select o ->> 'label' from jsonb_array_elements(p.options) o where o ->> 'id' = top.option_id);
    end if;
    update public.match_polls set summary = s where id = p.id and summary is null;
    perform realtime.send(jsonb_build_object('id', p.id, 'summary', s, 'tallies', public.crowd_tallies_json(p.id)),
                          'poll_closed', 'match:' || p_fixture, true);
  end loop;

  delete from public.match_poll_queue where fixture_id = p_fixture and queued_at < now() - interval '3 minutes';

  -- Each pass removes one queued row, so the loop ends.
  loop
    select * into q from public.match_poll_queue where fixture_id = p_fixture order by queued_at, id limit 1;
    exit when q.id is null;
    -- Blocked while any poll is open, except a minute-60 card next to other minute-60 cards.
    exit when exists (select 1 from public.match_polls m
                      where m.fixture_id = p_fixture and m.closes_at > now() and (q.kind <> 'sub60' or m.kind <> 'sub60'));
    delete from public.match_poll_queue where id = q.id;
    perform public.crowd_open_poll(p_fixture, q.kind, q.source, q.payload ->> 'question', q.payload -> 'options',
      nullif(q.payload -> 'options_in', 'null'::jsonb), q.payload ->> 'scope');
    q := null;
  end loop;
end $$;
revoke all on function private.crowd_tick_work(bigint) from public, anon, authenticated;

-- Is there anything for a tick to do right now? (Read only, no lock.) Same conditions as crowd_tick_work.
create function private.crowd_tick_due(p_fixture bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.match_polls m where m.fixture_id = p_fixture and m.closes_at <= now() and m.summary is null)
      or exists (select 1 from public.match_poll_queue q
                  where q.fixture_id = p_fixture
                    and (q.queued_at < now() - interval '3 minutes'
                         or not exists (select 1 from public.match_polls m
                                         where m.fixture_id = p_fixture and m.closes_at > now()
                                           and (q.kind <> 'sub60' or m.kind <> 'sub60'))))
$$;
revoke all on function private.crowd_tick_due(bigint) from public, anon, authenticated;

create or replace function public.crowd_tick(p_fixture bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  -- A fan's own call (the RPC): rate-limited, only when there is work, never waiting for the lock.
  if me is not null and auth.role() = 'authenticated' and pg_trigger_depth() = 0 then
    insert into private.crowd_tick_calls as c (user_id, fixture_id, at) values (me, p_fixture, now())
      on conflict (user_id, fixture_id) do update set at = excluded.at where c.at <= now() - interval '2 seconds';
    if not found then
      return;
    end if;
    -- The fan's rows of other matches, a day old, go (the table stays one row per active fan and match).
    delete from private.crowd_tick_calls c where c.user_id = me and c.fixture_id <> p_fixture and c.at < now() - interval '1 day';
    if not private.crowd_tick_due(p_fixture) or not pg_try_advisory_xact_lock(hashtext('crowd:' || p_fixture)) then
      return;
    end if;
  end if;
  perform private.crowd_tick_work(p_fixture);
end $$;
revoke all on function public.crowd_tick(bigint) from public, anon;
grant execute on function public.crowd_tick(bigint) to authenticated, service_role;

-- ---------- 2. trip_requests: suspensions once per query ----------
alter policy trip_requests_not_ride_suspended on public.trip_requests
  using (user_id = (select auth.uid()) or (select public.is_app_admin())
         or user_id <> all (coalesce((select private.active_ride_suspensions()), '{}')));
