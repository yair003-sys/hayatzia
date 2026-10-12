-- Crowd verdict (דעת הקהל): live polls inside the match room.
-- Polls are created only by the database itself or by trusted callers (service role); fans only vote.
-- Counts live in match_poll_tallies and move by trigger; clients never send counts.

-- Demo fixtures (staging only) are flagged so the UI labels them. The ingest never sends this column.
alter table public.fixtures add column if not exists is_demo boolean not null default false;

create table public.match_polls (
  id            uuid primary key default gen_random_uuid(),
  fixture_id    bigint not null references public.fixtures (id) on delete cascade,
  kind          text not null check (kind in ('penalty', 'red', 'offside', 'var', 'card', 'goal', 'sub60', 'sub_event', 'motm')),
  question      varchar(80) not null,
  options       jsonb not null check (jsonb_typeof(options) = 'array'),        -- [{id, emoji, label}]
  options_in    jsonb check (options_in is null or jsonb_typeof(options_in) = 'array'), -- bench row (sub60 only)
  source        text not null check (source in ('chat', 'event', 'schedule')),
  voter_scope   text references public.teams (id),                            -- null = everyone votes
  opens_at      timestamptz not null default now(),
  closes_at     timestamptz not null,
  summary       text,                                                          -- set once when closed
  last_tally_at timestamptz not null default '-infinity',
  created_at    timestamptz not null default now(),
  check (closes_at > opens_at)
);
create index match_polls_fixture_opens_idx on public.match_polls (fixture_id, opens_at desc);

create table public.match_poll_votes (
  poll_id     uuid not null references public.match_polls (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  option_id   varchar(40) not null,
  option_in   varchar(40),
  voter_group char(1) not null default 'n' check (voter_group in ('h', 'a', 'n')),  -- stamped by trigger
  updated_at  timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index match_poll_votes_user_idx on public.match_poll_votes (user_id);

create table public.match_poll_tallies (
  poll_id     uuid not null references public.match_polls (id) on delete cascade,
  row_kind    char(1) not null check (row_kind in ('o', 'i')),   -- o = main / "out" row, i = "in" row
  option_id   varchar(40) not null,
  voter_group char(1) not null check (voter_group in ('h', 'a', 'n')),
  n           integer not null default 0 check (n >= 0),
  primary key (poll_id, row_kind, option_id, voter_group)
);

create function public.match_poll_votes_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p   record;
  fan text;
begin
  select mp.*, public.club_of_api(f.home_api_id) as home, public.club_of_api(f.away_api_id) as away
    into p from public.match_polls mp join public.fixtures f on f.id = mp.fixture_id where mp.id = new.poll_id;
  if not found then
    raise exception 'no such poll' using errcode = '23503';
  end if;
  if now() >= p.closes_at then
    raise exception 'poll_closed' using errcode = 'P0001';
  end if;
  select pr.team_id into fan from public.profiles pr where pr.user_id = new.user_id;
  if fan is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if p.voter_scope is not null and fan is distinct from p.voter_scope then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from jsonb_array_elements(p.options) o where o ->> 'id' = new.option_id) then
    raise exception 'bad_option' using errcode = '22023';
  end if;
  if p.kind = 'sub60' then
    if new.option_in is null
       or not exists (select 1 from jsonb_array_elements(p.options_in) o where o ->> 'id' = new.option_in) then
      raise exception 'bad_option' using errcode = '22023';
    end if;
  elsif new.option_in is not null then
    raise exception 'bad_option' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.poll_id := old.poll_id;
    new.user_id := old.user_id;
  end if;
  new.voter_group := case when fan = p.home then 'h' when fan = p.away then 'a' else 'n' end;
  new.updated_at  := now();
  return new;
end $$;
create trigger match_poll_votes_stamp before insert or update on public.match_poll_votes
  for each row execute function public.match_poll_votes_stamp();

create function public.crowd_bump(p_poll uuid, p_row char, p_option text, p_group char, p_delta integer) returns void
language sql security definer set search_path = '' as $$
  insert into public.match_poll_tallies as t (poll_id, row_kind, option_id, voter_group, n)
  values (p_poll, p_row, p_option, p_group, greatest(p_delta, 0))
  on conflict (poll_id, row_kind, option_id, voter_group) do update set n = greatest(t.n + p_delta, 0)
$$;
revoke all on function public.crowd_bump(uuid, char, text, char, integer) from public, anon, authenticated;

create function public.match_poll_votes_tally() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  return null;
end $$;
create trigger match_poll_votes_tally after insert or update on public.match_poll_votes
  for each row execute function public.match_poll_votes_tally();

alter table public.match_polls        enable row level security;
alter table public.match_poll_votes   enable row level security;
alter table public.match_poll_tallies enable row level security;

create policy match_polls_read   on public.match_polls        for select to authenticated using (true);
create policy match_tallies_read on public.match_poll_tallies for select to authenticated using (true);
create policy match_votes_own_read   on public.match_poll_votes for select to authenticated using (user_id = (select auth.uid()));
create policy match_votes_own_insert on public.match_poll_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy match_votes_own_update on public.match_poll_votes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.match_polls, public.match_poll_votes, public.match_poll_tallies from anon, authenticated;
grant select on public.match_polls, public.match_poll_tallies, public.match_poll_votes to authenticated;
grant insert (poll_id, option_id, option_in) on public.match_poll_votes to authenticated;
grant update (option_id, option_in) on public.match_poll_votes to authenticated;
grant all on public.match_polls, public.match_poll_votes, public.match_poll_tallies to service_role;
-- The staging demo posts as demo fans (the stamp trigger still decides side, nick and window).
grant insert on public.match_messages to service_role;
grant select, insert, update on public.fixtures, public.fixture_details to service_role;
