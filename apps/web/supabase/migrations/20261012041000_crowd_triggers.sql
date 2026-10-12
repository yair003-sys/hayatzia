-- Crowd verdict: how polls open (chat bursts, match events), wait, close, and reach clients.
-- Thresholds (one place): open 90 s · burst = 15 distinct fans in 60 s · cooldown 3 min per kind ·
-- one open poll per match (the two minute-60 cards open together) · tally broadcast ≤ 1/s per poll.

-- Keyword of a chat message, or null. Lower-case, collapse repeated letters ("פנדללל" → "פנדל"),
-- punctuation to spaces, then whole-word match (optional ה/ו prefix). Patterns are written collapsed.
create function public.crowd_keyword(p_body text) returns text
language sql immutable set search_path = '' as $$
  with s as (
    select ' ' || regexp_replace(regexp_replace(lower(p_body), '(.)\1+', '\1', 'g'), '[^a-z0-9א-ת]+', ' ', 'g') || ' ' as t
  )
  select case
    when t ~ ' [הו]?(פנדל|פנדלים|penalty|penalti) ' then 'penalty'
    when t ~ ' [הו]?(אדום|red) ' then 'red'
    when t ~ ' [הו]?(נבדל|ofside) ' then 'offside'
    when t ~ ' [הו]?(var|ואר) ' then 'var'
  end
  from s
$$;

-- Distinct fans who wrote a keyword recently (one row per fan per kind per match).
create table public.match_chat_bursts (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  kind       text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  at         timestamptz not null default now(),
  primary key (fixture_id, kind, user_id)
);
create index match_chat_bursts_recent_idx on public.match_chat_bursts (fixture_id, kind, at);

-- Event polls waiting for the open poll to close.
create table public.match_poll_queue (
  id         bigserial primary key,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  kind       text not null,
  source     text not null,
  payload    jsonb not null,   -- {question, options, options_in, scope}
  queued_at  timestamptz not null default now()
);
create index match_poll_queue_fixture_idx on public.match_poll_queue (fixture_id, queued_at);

alter table public.match_chat_bursts enable row level security;
alter table public.match_poll_queue  enable row level security;
revoke all on public.match_chat_bursts, public.match_poll_queue from anon, authenticated;
grant all on public.match_chat_bursts, public.match_poll_queue to service_role;

create function public.crowd_poll_json(p public.match_polls) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'fixture_id', p.fixture_id, 'kind', p.kind, 'question', p.question,
    'options', p.options, 'options_in', p.options_in, 'source', p.source, 'voter_scope', p.voter_scope,
    'opens_at', p.opens_at, 'closes_at', p.closes_at, 'summary', p.summary)
$$;

create function public.crowd_tallies_json(p_poll uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('r', t.row_kind, 'o', t.option_id, 'g', t.voter_group, 'n', t.n)), '[]'::jsonb)
  from public.match_poll_tallies t where t.poll_id = p_poll
$$;

-- Opens a poll now, or queues it (events) / drops it (chat) when another poll is open. Null when not opened.
create function public.crowd_open_poll(p_fixture bigint, p_kind text, p_source text, p_question text,
  p_options jsonb, p_options_in jsonb, p_scope text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  poll public.match_polls;
begin
  perform pg_advisory_xact_lock(hashtext('crowd:' || p_fixture));
  if exists (select 1 from public.match_polls m
             where m.fixture_id = p_fixture and m.kind = p_kind and m.opens_at > now() - interval '3 minutes'
               and (p_kind <> 'sub60' or m.voter_scope is not distinct from p_scope)) then
    return null;
  end if;
  if exists (select 1 from public.match_polls m
             where m.fixture_id = p_fixture and m.closes_at > now() and (p_kind <> 'sub60' or m.kind <> 'sub60')) then
    if p_source <> 'chat' then
      insert into public.match_poll_queue (fixture_id, kind, source, payload)
      values (p_fixture, p_kind, p_source,
              jsonb_build_object('question', p_question, 'options', p_options, 'options_in', p_options_in, 'scope', p_scope));
    end if;
    return null;
  end if;
  insert into public.match_polls (fixture_id, kind, question, options, options_in, source, voter_scope, opens_at, closes_at)
  values (p_fixture, p_kind, p_question, p_options, p_options_in, p_source, p_scope, now(), now() + interval '90 seconds')
  returning * into poll;
  perform realtime.send(public.crowd_poll_json(poll), 'poll', 'match:' || p_fixture, true);
  return poll.id;
end $$;

-- Closes expired polls once (summary + final tallies broadcast), then opens the next queued poll.
create function public.crowd_tick(p_fixture bigint) returns void
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
  if not exists (select 1 from public.match_polls m where m.fixture_id = p_fixture and m.closes_at > now()) then
    delete from public.match_poll_queue where id = (
      select id from public.match_poll_queue where fixture_id = p_fixture order by queued_at, id limit 1
    ) returning * into q;
    if q.id is not null then
      perform public.crowd_open_poll(p_fixture, q.kind, q.source, q.payload ->> 'question', q.payload -> 'options',
        nullif(q.payload -> 'options_in', 'null'::jsonb), q.payload ->> 'scope');
    end if;
  end if;
end $$;

-- Trusted callers (staging demo now, live-events poller later) open event and scheduled polls here.
create function public.open_event_poll(p_fixture bigint, p_kind text, p_question text, p_options jsonb,
  p_options_in jsonb, p_scope text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform public.crowd_tick(p_fixture);
  return public.crowd_open_poll(p_fixture, p_kind, case when p_kind in ('sub60', 'motm') then 'schedule' else 'event' end,
    p_question, p_options, p_options_in, p_scope);
end $$;

create function public.crowd_chat_template(p_kind text, out question text, out options jsonb)
language sql immutable set search_path = '' as $$
  select q, o::jsonb from (values
    ('penalty', 'פנדל?', '[{"id":"yes","emoji":"✅","label":"פנדל"},{"id":"no","emoji":"❌","label":"לא"},{"id":"dive","emoji":"🎭","label":"צלילה"}]'),
    ('red', 'מגיע אדום?', '[{"id":"red","emoji":"🟥","label":"אדום"},{"id":"yellow","emoji":"🟨","label":"צהוב מספיק"},{"id":"none","emoji":"❌","label":"כלום"}]'),
    ('offside', 'היה נבדל?', '[{"id":"off","emoji":"🚩","label":"נבדל"},{"id":"on","emoji":"✅","label":"לא נבדל"}]'),
    ('var', 'צריך לבדוק ב-VAR?', '[{"id":"yes","emoji":"📺","label":"כן"},{"id":"no","emoji":"❌","label":"לא"}]')
  ) v(k, q, o) where v.k = p_kind
$$;

create function public.match_messages_crowd() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text := public.crowd_keyword(new.body);
  c integer;
  t record;
begin
  if k is null then
    return null;
  end if;
  insert into public.match_chat_bursts (fixture_id, kind, user_id, at) values (new.fixture_id, k, new.user_id, now())
    on conflict (fixture_id, kind, user_id) do update set at = excluded.at;
  delete from public.match_chat_bursts where fixture_id = new.fixture_id and kind = k and at < now() - interval '2 minutes';
  select count(*) into c from public.match_chat_bursts
    where fixture_id = new.fixture_id and kind = k and at > now() - interval '60 seconds';
  if c >= 15 then
    perform public.crowd_tick(new.fixture_id);
    select * into t from public.crowd_chat_template(k);
    if public.crowd_open_poll(new.fixture_id, k, 'chat', t.question, t.options, null, null) is not null then
      delete from public.match_chat_bursts where fixture_id = new.fixture_id and kind = k;
    end if;
  end if;
  return null;
end $$;
create trigger match_messages_crowd after insert on public.match_messages
  for each row execute function public.match_messages_crowd();

-- Tallies: same counting as before, plus a broadcast at most once per second per poll.
create or replace function public.match_poll_votes_tally() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fx bigint;
begin
  if tg_op = 'UPDATE' then
    perform public.crowd_bump(old.poll_id, 'o', old.option_id, old.voter_group, -1);
    if old.option_in is not null then
      perform public.crowd_bump(old.poll_id, 'i', old.option_in, old.voter_group, -1);
    end if;
  end if;
  perform public.crowd_bump(new.poll_id, 'o', new.option_id, new.voter_group, 1);
  if new.option_in is not null then
    perform public.crowd_bump(new.poll_id, 'i', new.option_in, new.voter_group, 1);
  end if;
  update public.match_polls set last_tally_at = now()
    where id = new.poll_id and last_tally_at < now() - interval '1 second'
    returning fixture_id into fx;
  if fx is not null then
    perform realtime.send(jsonb_build_object('poll_id', new.poll_id, 'tallies', public.crowd_tallies_json(new.poll_id)),
                          'tally', 'match:' || fx, true);
  end if;
  return null;
end $$;

revoke all on function public.crowd_keyword(text) from public;
revoke all on function public.crowd_poll_json(public.match_polls) from public;
revoke all on function public.crowd_tallies_json(uuid) from public, anon, authenticated;
revoke all on function public.crowd_open_poll(bigint, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.crowd_tick(bigint) from public, anon;
revoke all on function public.open_event_poll(bigint, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.crowd_chat_template(text) from public;
grant execute on function public.crowd_tick(bigint) to authenticated, service_role;
grant execute on function public.open_event_poll(bigint, text, text, jsonb, jsonb, text) to service_role;
