-- P1 core: clubs, players, fan profiles with a one-time team lock.
-- Every table: RLS on, deny by default. Grants are explicit (the project does not auto-expose tables).

create table public.teams (
  id          text primary key check (id ~ '^[a-z]{3}$'),
  name        text not null,
  short       text not null,
  color_bg    text not null check (color_bg ~ '^#[0-9A-Fa-f]{6}$'),
  color_ring  text not null check (color_ring ~ '^#[0-9A-Fa-f]{6}$'),
  color_bar   text not null check (color_bar ~ '^#[0-9A-Fa-f]{6}$'),
  api_names   text[] not null default '{}',   -- API-Football names that map to this club
  sort        smallint not null
);

create table public.players (
  id          text primary key,
  team_id     text not null references public.teams(id) on delete cascade,
  number      smallint,
  name_he     text not null,
  name_short  text not null,
  position    text not null,
  injured     boolean not null default false,
  in_xi       boolean not null default false,  -- part of the sample starting XI shown on the pitch
  pitch_x     smallint check (pitch_x between 0 and 100),
  pitch_y     smallint check (pitch_y between 0 and 100)
);
create index players_team_idx on public.players (team_id);

create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nick        varchar(20) not null check (char_length(btrim(nick)) between 2 and 20),
  team_id     text not null references public.teams(id),
  created_at  timestamptz not null default now()
);
create index profiles_team_idx on public.profiles (team_id);

-- The club is chosen once and can never change (also blocks changing who owns the row).
create function public.profiles_lock_team() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.team_id is distinct from old.team_id then
    raise exception 'team is locked for this fan' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'profile identity is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_lock_team before update on public.profiles
  for each row execute function public.profiles_lock_team();

-- The caller's club. Used by every team-private policy. security definer so policies don't recurse.
create function public.my_team() returns text
language sql stable security definer set search_path = '' as $$
  select team_id from public.profiles where user_id = auth.uid()
$$;
revoke all on function public.my_team() from public;
grant execute on function public.my_team() to authenticated;

alter table public.teams    enable row level security;
alter table public.players  enable row level security;
alter table public.profiles enable row level security;

create policy teams_read   on public.teams   for select to anon, authenticated using (true);
create policy players_read on public.players for select to anon, authenticated using (true);

create policy profiles_read_own_and_team on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or team_id = (select public.my_team()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.teams, public.players to anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant update (nick) on public.profiles to authenticated;   -- column-level: only the nickname is editable
