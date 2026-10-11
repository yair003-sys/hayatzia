-- P2: match rooms. Every signed-in fan can read; only fans of the two clubs can write, and only while the room
-- is open: 30 minutes before kick-off until 170 minutes after (90' + break + stoppage ≈ 110', then 60' "closing").
-- Same timing as the legacy app (DUR=110, OPEN_BEFORE=30, CLOSE_AFTER=60).

-- API-Football calls Kiryat Shmona "Ironi Kiryat Shmona".
update public.teams set api_names = array['Hapoel Ironi Kiryat Shmona', 'Ironi Kiryat Shmona'] where id = 'ikn';

-- Our club for an API-Football team id (null for clubs that are not in the league this season).
create function public.club_of_api(p_api_id integer) returns text
language sql stable security definer set search_path = '' as $$
  select t.id from public.teams t join public.api_teams a on a.name = any (t.api_names) where a.api_id = p_api_id limit 1
$$;
revoke all on function public.club_of_api(integer) from public;
grant execute on function public.club_of_api(integer) to anon, authenticated;

create function public.match_room_open(p_kickoff timestamptz, p_at timestamptz default now()) returns boolean
language sql immutable as $$
  select p_at >= p_kickoff - interval '30 minutes' and p_at < p_kickoff + interval '170 minutes'
$$;

create table public.match_messages (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id     text not null default public.my_team() references public.teams (id),  -- stamped by trigger
  side        char(1) not null default 'h' check (side in ('h', 'a')),                -- stamped by trigger
  nick        varchar(20) not null default '',                                         -- stamped by trigger
  body        varchar(200) not null check (char_length(btrim(body)) between 1 and 200),
  created_at  timestamptz not null default now()
);
create index match_messages_fixture_created_idx on public.match_messages (fixture_id, created_at desc, id desc);
create index match_messages_user_created_idx on public.match_messages (user_id, created_at desc);

create function public.match_messages_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
  fx  record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  select f.kickoff_at, public.club_of_api(f.home_api_id) as home, public.club_of_api(f.away_api_id) as away
    into fx from public.fixtures f where f.id = new.fixture_id;
  if not found then
    raise exception 'no such match' using errcode = '23503';
  end if;
  if not public.match_room_open(fx.kickoff_at) then
    raise exception 'room_closed' using errcode = 'P0001';
  end if;
  if fan.team_id = fx.home then
    new.side := 'h';
  elsif fan.team_id = fx.away then
    new.side := 'a';
  else
    raise exception 'not_playing' using errcode = '42501';
  end if;
  new.team_id    := fan.team_id;
  new.nick       := fan.nick;
  new.body       := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.match_messages m
      where m.user_id = new.user_id and m.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger match_messages_stamp before insert on public.match_messages
  for each row execute function public.match_messages_stamp();

create function public.match_messages_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes('match:' || new.fixture_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, null);
  return null;
end $$;
create trigger match_messages_broadcast after insert on public.match_messages
  for each row execute function public.match_messages_broadcast();

alter table public.match_messages enable row level security;

create policy match_messages_read on public.match_messages for select to authenticated using (true);
-- The trigger decides side and checks the window; the policy keeps the row bound to its author and club.
create policy match_messages_insert on public.match_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));

revoke all on public.match_messages from anon, authenticated;
grant select on public.match_messages to authenticated;
grant insert (fixture_id, body) on public.match_messages to authenticated;

create policy match_channel_receive on realtime.messages for select to authenticated
  using (realtime.topic() like 'match:%' and realtime.messages.extension = 'broadcast');
