-- P2: team chat. Team-private, realtime through database Broadcast on private channels "team:<club id>".

create table public.team_messages (
  id          uuid primary key default gen_random_uuid(),
  team_id     text not null references public.teams (id),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick        varchar(20) not null,
  body        varchar(200) not null check (char_length(btrim(body)) between 1 and 200),
  created_at  timestamptz not null default now()
);
-- Keyset pagination of a team's chat, newest first.
create index team_messages_team_created_idx on public.team_messages (team_id, created_at desc, id desc);
-- Rate limit lookups.
create index team_messages_user_created_idx on public.team_messages (user_id, created_at desc);

-- The server decides the club, the nickname and the time. The fan only sends the text.
create function public.team_messages_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  new.team_id    := fan.team_id;
  new.nick       := fan.nick;
  new.body       := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.team_messages m
      where m.user_id = new.user_id and m.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger team_messages_stamp before insert on public.team_messages
  for each row execute function public.team_messages_stamp();

-- Fan-out: one broadcast per message to the team's private channel (scales better than postgres_changes,
-- which re-checks RLS for every subscriber on every change).
create function public.team_messages_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes('team:' || new.team_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, null);
  return null;
end $$;
create trigger team_messages_broadcast after insert on public.team_messages
  for each row execute function public.team_messages_broadcast();

alter table public.team_messages enable row level security;

create policy team_messages_read on public.team_messages for select to authenticated
  using (team_id = (select public.my_team()));
create policy team_messages_insert on public.team_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));

grant select on public.team_messages to authenticated;
grant insert (body) on public.team_messages to authenticated;   -- column-level: the fan sends only the text

-- Realtime authorization: a fan may only join their own club's private channel.
create policy team_channel_receive on realtime.messages for select to authenticated
  using (realtime.topic() = 'team:' || (select public.my_team()) and realtime.messages.extension = 'broadcast');
