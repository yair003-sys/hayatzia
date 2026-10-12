-- Crowd verdict: crowd_tick drains the queue properly.
-- 1. Queued minute-60 cards (one per club) open together, as the spec's one exception to "one open poll".
-- 2. A queued poll that the cooldown refuses is dropped and the next queued poll is tried in the same tick.

create or replace function public.crowd_tick(p_fixture bigint) returns void
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

revoke all on function public.crowd_tick(bigint) from public, anon;
grant execute on function public.crowd_tick(bigint) to authenticated, service_role;
