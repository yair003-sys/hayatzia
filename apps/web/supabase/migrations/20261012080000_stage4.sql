-- Stage 4 (owner, 2026-10-12):
-- 1. "הייתי שם": check-in only by location — within 500 m of the match's stadium, from 30′ before kick-off until the
--    match room closes. The check is done here, never trusted from the phone alone.
-- 2. Fans' player of the match: after the final whistle, while the room is open, 1–10 per player of your club.
-- 3. Stand songs: only the club's fan representative adds songs (owner appoints; nobody yet). Fans give 🔥.

-- ── stadiums (OpenStreetMap, 2026-10-12); matched on the fixture's venue name from the data provider ──
create table public.stadiums (
  id      text primary key,
  name_he text not null,
  names   text[] not null,   -- provider venue names (lower-case)
  lat     double precision not null,
  lng     double precision not null
);
insert into public.stadiums (id, name_he, names, lat, lng) values
  ('bloomfield', 'בלומפילד', array['bloomfield stadium', 'bloomfield'], 32.05183, 34.76157),
  ('teddy', 'טדי', array['teddi malcha stadium', 'teddy stadium', 'teddy kollek stadium'], 31.75111, 35.19083),
  ('sammy-ofer', 'סמי עופר', array['sammy ofer stadium', 'sami ofer stadium'], 32.78309, 34.96508),
  ('turner', 'טרנר', array['yaakov turner toto stadium', 'turner stadium'], 31.27341, 34.77954),
  ('netanya', 'אצטדיון נתניה', array['netanya stadium'], 32.29442, 34.86447),
  ('hamoshava', 'המושבה', array['hamoshava stadium'], 32.10417, 34.86507),
  ('green', 'גרין', array['green stadium'], 32.68989, 35.31114),
  ('yud-alef', 'י״א', array['yud-alef stadium'], 31.81041, 34.64835),
  ('acre', 'עכו', array['acre municipal stadium'], 32.90785, 35.08601),
  ('doha', 'דוחא', array['doha stadium'], 32.86669, 35.31084),
  ('ramat-gan', 'רמת גן', array['ramat gan stadium'], 32.10032, 34.82437);

alter table public.stadiums enable row level security;
create policy stadiums_read on public.stadiums for select to anon, authenticated using (true);
revoke all on public.stadiums from anon, authenticated;
grant select on public.stadiums to anon, authenticated;
grant all on public.stadiums to service_role;

-- ── check-ins ──
create table public.checkins (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  team_id    text not null references public.teams (id),
  away       boolean not null default false,
  stadium_id text references public.stadiums (id),
  created_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);
create index checkins_user_idx on public.checkins (user_id, created_at desc);

alter table public.checkins enable row level security;
create policy checkins_own_read on public.checkins for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.checkins from anon, authenticated;
grant select on public.checkins to authenticated;
grant all on public.checkins to service_role;

-- Great-circle distance in metres.
create function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- The only way to check in. Returns {number, away, stadium} (number = the fan's check-ins this season).
create function public.check_in(p_fixture bigint, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me   uuid := auth.uid();
  fan  text;
  f    record;
  s    public.stadiums;
  home text;
  away text;
  n    integer;
begin
  select p.team_id into fan from public.profiles p where p.user_id = me;
  if fan is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  select * into f from public.fixtures where id = p_fixture;
  if not found then
    raise exception 'no such match' using errcode = '23503';
  end if;
  home := public.club_of_api(f.home_api_id);
  away := public.club_of_api(f.away_api_id);
  if fan is distinct from home and fan is distinct from away then
    raise exception 'not_playing' using errcode = '42501';
  end if;
  if not public.match_room_open(f.kickoff_at) then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  select * into s from public.stadiums st where lower(coalesce(f.venue, '')) = any (st.names) limit 1;
  if not found then
    raise exception 'no_venue' using errcode = 'P0001';
  end if;
  if public.distance_m(p_lat, p_lng, s.lat, s.lng) > 500 then
    raise exception 'too_far' using errcode = 'P0001';
  end if;
  insert into public.checkins (user_id, fixture_id, team_id, away, stadium_id)
  values (me, p_fixture, fan, fan = away, s.id)
  on conflict (user_id, fixture_id) do nothing;
  select count(*) into n from public.checkins c join public.fixtures x on x.id = c.fixture_id
    where c.user_id = me and x.season = f.season;
  return jsonb_build_object('number', n, 'away', fan = away, 'stadium', s.name_he);
end $$;
revoke all on function public.check_in(bigint, double precision, double precision) from public, anon;
grant execute on function public.check_in(bigint, double precision, double precision) to authenticated;

-- ── fans' player of the match ──
create table public.match_ratings (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  player_id  text not null references public.players (id) on delete cascade,
  score      smallint not null check (score between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, fixture_id, player_id)
);
create table public.match_rating_stats (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  player_id  text not null references public.players (id) on delete cascade,
  sum        integer not null default 0,
  count      integer not null default 0,
  primary key (fixture_id, player_id)
);
create index match_rating_stats_board_idx on public.match_rating_stats (fixture_id, count desc);

create function public.match_ratings_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan  text;
  f    record;
  team text;
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.fixture_id := old.fixture_id;
    new.player_id := old.player_id;
  end if;
  select p.team_id into fan from public.profiles p where p.user_id = new.user_id;
  select * into f from public.fixtures where id = new.fixture_id;
  if fan is null or f is null then
    raise exception 'no profile or match' using errcode = '42501';
  end if;
  select pl.team_id into team from public.players pl where pl.id = new.player_id;
  if team is distinct from fan
     or fan not in (coalesce(public.club_of_api(f.home_api_id), ''), coalesce(public.club_of_api(f.away_api_id), '')) then
    raise exception 'not_your_player' using errcode = '42501';
  end if;
  if f.status not in ('FT', 'AET', 'PEN') or not public.match_room_open(f.kickoff_at) then
    raise exception 'not_finished' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger match_ratings_stamp before insert or update on public.match_ratings
  for each row execute function public.match_ratings_stamp();

create function public.match_ratings_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.match_rating_stats as s (fixture_id, player_id, sum, count)
  values (new.fixture_id, new.player_id, new.score - coalesce(old.score, 0), case when tg_op = 'INSERT' then 1 else 0 end)
  on conflict (fixture_id, player_id) do update set sum = s.sum + excluded.sum, count = s.count + excluded.count;
  return null;
end $$;
create trigger match_ratings_stats after insert or update of score on public.match_ratings
  for each row execute function public.match_ratings_stats();

alter table public.match_ratings enable row level security;
alter table public.match_rating_stats enable row level security;
create policy match_ratings_own_read on public.match_ratings for select to authenticated using (user_id = (select auth.uid()));
create policy match_ratings_own_insert on public.match_ratings for insert to authenticated with check (user_id = (select auth.uid()));
create policy match_ratings_own_update on public.match_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy match_rating_stats_own_club on public.match_rating_stats for select to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.team_id = (select public.my_team())));
revoke all on public.match_ratings, public.match_rating_stats from anon, authenticated;
grant select on public.match_ratings, public.match_rating_stats to authenticated;
grant insert (fixture_id, player_id, score) on public.match_ratings to authenticated;
grant update (score) on public.match_ratings to authenticated;
grant all on public.match_ratings, public.match_rating_stats to service_role;

-- ── stand songs ──
create table public.club_reps (
  team_id    text not null references public.teams (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.club_reps enable row level security;
create policy club_reps_own_club on public.club_reps for select to authenticated using (team_id = (select public.my_team()));
revoke all on public.club_reps from anon, authenticated;
grant select on public.club_reps to authenticated;
grant all on public.club_reps to service_role;

create function public.is_club_rep() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_reps r where r.user_id = auth.uid() and r.team_id = public.my_team())
$$;
revoke all on function public.is_club_rep() from public, anon;
grant execute on function public.is_club_rep() to authenticated;

create table public.chants (
  id          uuid primary key default gen_random_uuid(),
  team_id     text not null default public.my_team() references public.teams (id),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       varchar(80) not null check (char_length(btrim(title)) between 1 and 80),
  lyrics      varchar(2000) not null default '',
  audio_path  text unique,
  fire_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index chants_team_idx on public.chants (team_id, fire_count desc, created_at desc);

create table public.chant_fires (
  chant_id uuid not null references public.chants (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (chant_id, user_id)
);
create index chant_fires_user_idx on public.chant_fires (user_id);

create function public.chant_fire_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.chants set fire_count = fire_count + 1 where id = new.chant_id;
  else
    update public.chants set fire_count = greatest(fire_count - 1, 0) where id = old.chant_id;
  end if;
  return null;
end $$;
create trigger chant_fire_count after insert or delete on public.chant_fires
  for each row execute function public.chant_fire_count();

alter table public.chants enable row level security;
alter table public.chant_fires enable row level security;
create policy chants_own_club on public.chants for select to authenticated using (team_id = (select public.my_team()));
create policy chants_rep_insert on public.chants for insert to authenticated
  with check (created_by = (select auth.uid()) and team_id = (select public.my_team()) and (select public.is_club_rep()));
create policy chants_rep_delete on public.chants for delete to authenticated
  using (team_id = (select public.my_team()) and (select public.is_club_rep()));
create policy chant_fires_own on public.chant_fires for select to authenticated using (user_id = (select auth.uid()));
create policy chant_fires_insert on public.chant_fires for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.chants c where c.id = chant_id));
create policy chant_fires_delete on public.chant_fires for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.chants, public.chant_fires from anon, authenticated;
grant select, delete on public.chants to authenticated;
grant insert (title, lyrics, audio_path) on public.chants to authenticated;
grant select, delete on public.chant_fires to authenticated;
grant insert (chant_id) on public.chant_fires to authenticated;
grant all on public.chants, public.chant_fires to service_role;

-- Recordings: private bucket; only reps upload (own folder); club fans read files of their club's songs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chants', 'chants', false, 15728640, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy chants_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chants' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_club_rep()));
create policy chants_files_read on storage.objects for select to authenticated
  using (bucket_id = 'chants' and exists (select 1 from public.chants c where c.audio_path = name));
create policy chants_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chants' and (storage.foldername(name))[1] = (select auth.uid()::text));
