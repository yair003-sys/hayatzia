-- P4: team life. Trips to matches (with seat requests), fan events (with "going"), and the fans' market.
-- All team-private: rows carry team_id = the author's club and are visible only to that club.

-- Shared stamp for team-private fan content: club, nickname and time come from the server, plus an hourly limit
-- (TG_ARGV[0], default 20) on rows per fan in that table.
create function public.stamp_team_fan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
  recent integer;
  max_per_hour integer := coalesce(nullif(tg_argv[0], '')::integer, 20);
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  new.team_id := fan.team_id;
  new.nick := fan.nick;
  new.created_at := now();
  execute format('select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 hour''', tg_table_name)
    into recent using new.user_id;
  if recent >= max_per_hour then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- trips ----------
create table public.trips (
  id                 uuid primary key default gen_random_uuid(),
  team_id            text not null default public.my_team() references public.teams (id),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick               varchar(20) not null default '',
  fixture_id         bigint not null references public.fixtures (id) on delete cascade,
  kind               text not null check (kind in ('offer', 'seek', 'meet')),
  from_city          varchar(40) not null check (char_length(btrim(from_city)) between 2 and 40),
  depart_before_min  smallint not null default 120 check (depart_before_min between 15 and 600),
  seats              smallint not null default 0 check (seats between 0 and 8),
  cost               text not null default 'share' check (cost in ('share', 'free')),
  note               varchar(140) not null default '',
  created_at         timestamptz not null default now()
);
create index trips_team_fixture_idx on public.trips (team_id, fixture_id, created_at desc);
create index trips_user_idx on public.trips (user_id, created_at desc);
create trigger trips_stamp before insert on public.trips for each row execute function public.stamp_team_fan('10');

create table public.trip_requests (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id     text not null default public.my_team() references public.teams (id),
  nick        varchar(20) not null default '',
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_requests_user_idx on public.trip_requests (user_id, created_at desc);
create trigger trip_requests_stamp before insert on public.trip_requests for each row execute function public.stamp_team_fan('30');

-- Requests start pending; only the trip owner changes the status, and accepted riders never exceed the seats.
create function public.trip_requests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  select * into t from public.trips where id = new.trip_id;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    if t.user_id = new.user_id then
      raise exception 'own trip' using errcode = '42501';
    end if;
    return new;
  end if;
  if t.user_id <> auth.uid() then
    raise exception 'only the driver decides' using errcode = '42501';
  end if;
  if new.status = 'accepted' and old.status <> 'accepted' and t.kind = 'offer'
     and (select count(*) from public.trip_requests r where r.trip_id = new.trip_id and r.status = 'accepted') >= t.seats then
    raise exception 'trip_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trip_requests_guard before insert or update on public.trip_requests
  for each row execute function public.trip_requests_guard();

-- ---------- events ----------
create table public.fan_events (
  id           uuid primary key default gen_random_uuid(),
  team_id      text not null default public.my_team() references public.teams (id),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick         varchar(20) not null default '',
  kind         text not null check (kind in ('screen', 'march', 'charity', 'meet', 'other')),
  title        varchar(80) not null check (char_length(btrim(title)) between 3 and 80),
  starts_at    timestamptz not null check (starts_at > '2026-01-01'),
  area         varchar(80) not null check (char_length(btrim(area)) between 2 and 80),
  note         varchar(200) not null default '',
  going_count  integer not null default 0,
  created_at   timestamptz not null default now()
);
create index fan_events_team_starts_idx on public.fan_events (team_id, starts_at);
create index fan_events_user_idx on public.fan_events (user_id, created_at desc);
create trigger fan_events_stamp before insert on public.fan_events for each row execute function public.stamp_team_fan('5');

create table public.fan_event_going (
  event_id  uuid not null references public.fan_events (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (event_id, user_id)
);
create index fan_event_going_user_idx on public.fan_event_going (user_id, event_id);

create function public.fan_event_going_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.fan_events set going_count = greatest(going_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
  where id = case when tg_op = 'INSERT' then new.event_id else old.event_id end;
  return null;
end $$;
create trigger fan_event_going_count after insert or delete on public.fan_event_going
  for each row execute function public.fan_event_going_count();

-- ---------- market ----------
create table public.market_items (
  id          uuid primary key default gen_random_uuid(),
  team_id     text not null default public.my_team() references public.teams (id),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick        varchar(20) not null default '',
  category    text not null check (category in ('shirt', 'scarf', 'flag', 'memo', 'other')),
  title       varchar(40) not null check (char_length(btrim(title)) between 2 and 40),
  size        varchar(10) not null default '',
  condition   text not null check (condition in ('new', 'like_new', 'used')),
  price       integer not null check (price between 0 and 100000),
  media_path  text unique,
  sold        boolean not null default false,
  created_at  timestamptz not null default now(),
  -- The market is for gear, never for tickets (legacy rule).
  check (title !~* '(כרטיס|ticket)')
);
create index market_items_team_idx on public.market_items (team_id, sold, created_at desc);
create index market_items_user_idx on public.market_items (user_id, created_at desc);
create trigger market_items_stamp before insert on public.market_items for each row execute function public.stamp_team_fan('10');

create function public.market_items_path() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.media_path is not null and split_part(new.media_path, '/', 1) <> new.user_id::text then
    raise exception 'media must be in your own folder' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger market_items_path before insert on public.market_items for each row execute function public.market_items_path();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('market', 'market', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy market_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'market' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy market_files_read on storage.objects for select to authenticated using (
  bucket_id = 'market'
  and ((storage.foldername(name))[1] = (select auth.uid()::text) or exists (select 1 from public.market_items m where m.media_path = name))
);
create policy market_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'market' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- ---------- row level security ----------
alter table public.trips           enable row level security;
alter table public.trip_requests   enable row level security;
alter table public.fan_events      enable row level security;
alter table public.fan_event_going enable row level security;
alter table public.market_items    enable row level security;

create policy trips_read on public.trips for select to authenticated using (team_id = (select public.my_team()));
create policy trips_insert on public.trips for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy trips_delete_own on public.trips for delete to authenticated using (user_id = (select auth.uid()));

-- A request is seen by the rider and by the trip's driver.
create policy trip_requests_read on public.trip_requests for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
);
create policy trip_requests_insert on public.trip_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.trips t where t.id = trip_id));
create policy trip_requests_update_driver on public.trip_requests for update to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));
create policy trip_requests_delete_own on public.trip_requests for delete to authenticated using (user_id = (select auth.uid()));

create policy fan_events_read on public.fan_events for select to authenticated using (team_id = (select public.my_team()));
create policy fan_events_insert on public.fan_events for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy fan_events_delete_own on public.fan_events for delete to authenticated using (user_id = (select auth.uid()));
create policy fan_event_going_read_own on public.fan_event_going for select to authenticated using (user_id = (select auth.uid()));
create policy fan_event_going_insert on public.fan_event_going for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.fan_events e where e.id = event_id));
create policy fan_event_going_delete on public.fan_event_going for delete to authenticated using (user_id = (select auth.uid()));

create policy market_items_read on public.market_items for select to authenticated using (team_id = (select public.my_team()));
create policy market_items_insert on public.market_items for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy market_items_update_own on public.market_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy market_items_delete_own on public.market_items for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.trips, public.trip_requests, public.fan_events, public.fan_event_going, public.market_items from anon, authenticated;
grant select, delete on public.trips to authenticated;
grant insert (fixture_id, kind, from_city, depart_before_min, seats, cost, note) on public.trips to authenticated;
grant select, delete on public.trip_requests to authenticated;
grant insert (trip_id) on public.trip_requests to authenticated;
grant update (status) on public.trip_requests to authenticated;
grant select, delete on public.fan_events to authenticated;
grant insert (kind, title, starts_at, area, note) on public.fan_events to authenticated;
grant select, delete on public.fan_event_going to authenticated;
grant insert (event_id) on public.fan_event_going to authenticated;
grant select, delete on public.market_items to authenticated;
grant insert (category, title, size, condition, price, media_path) on public.market_items to authenticated;
grant update (sold) on public.market_items to authenticated;
