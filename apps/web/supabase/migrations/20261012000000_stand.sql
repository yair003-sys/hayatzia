-- P2: the stand ("היציע שלי"). Team-private photos (likes, comments) and player ratings (1–5 stars + short review).

-- ---------- stand photos ----------
create table public.team_photos (
  id              uuid primary key default gen_random_uuid(),
  team_id         text not null default public.my_team() references public.teams (id),  -- stamped
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick            varchar(20) not null default '',                                         -- stamped
  media_path      text not null unique,
  caption         varchar(120) not null default '',
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  created_at      timestamptz not null default now()
);
create index team_photos_feed_idx on public.team_photos (team_id, created_at desc, id desc);
create index team_photos_user_idx on public.team_photos (user_id, created_at desc);

create table public.team_photo_likes (
  photo_id  uuid not null references public.team_photos (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (photo_id, user_id)
);
create index team_photo_likes_user_idx on public.team_photo_likes (user_id, photo_id);

create table public.team_photo_comments (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.team_photos (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick        varchar(20) not null default '',                                         -- stamped
  body        varchar(120) not null check (char_length(btrim(body)) between 1 and 120),
  created_at  timestamptz not null default now()
);
create index team_photo_comments_photo_idx on public.team_photo_comments (photo_id, created_at, id);
create index team_photo_comments_user_idx on public.team_photo_comments (user_id, created_at desc);

create function public.team_photos_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if split_part(new.media_path, '/', 1) <> new.user_id::text then
    raise exception 'media must be in your own folder' using errcode = '42501';
  end if;
  new.team_id := fan.team_id;
  new.nick := fan.nick;
  new.caption := btrim(new.caption);
  new.likes_count := 0;
  new.comments_count := 0;
  new.created_at := now();
  if (select count(*) from public.team_photos t where t.user_id = new.user_id and t.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger team_photos_stamp before insert on public.team_photos for each row execute function public.team_photos_stamp();

create function public.team_photo_comments_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  new.nick := fan.nick;
  new.body := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.team_photo_comments c where c.user_id = new.user_id and c.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger team_photo_comments_stamp before insert on public.team_photo_comments
  for each row execute function public.team_photo_comments_stamp();

create function public.team_photo_counter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  target uuid := case when tg_op = 'INSERT' then new.photo_id else old.photo_id end;
begin
  if tg_table_name = 'team_photo_likes' then
    update public.team_photos set likes_count = greatest(likes_count + delta, 0) where id = target;
  else
    update public.team_photos set comments_count = greatest(comments_count + delta, 0) where id = target;
  end if;
  return null;
end $$;
create trigger team_photo_likes_count after insert or delete on public.team_photo_likes
  for each row execute function public.team_photo_counter();
create trigger team_photo_comments_count after insert or delete on public.team_photo_comments
  for each row execute function public.team_photo_counter();

alter table public.team_photos         enable row level security;
alter table public.team_photo_likes    enable row level security;
alter table public.team_photo_comments enable row level security;

create policy team_photos_read on public.team_photos for select to authenticated
  using (team_id = (select public.my_team()));
create policy team_photos_insert on public.team_photos for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy team_photos_delete_own on public.team_photos for delete to authenticated using (user_id = (select auth.uid()));

create policy team_photo_likes_read_own on public.team_photo_likes for select to authenticated using (user_id = (select auth.uid()));
create policy team_photo_likes_insert on public.team_photo_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.team_photos t where t.id = photo_id));
create policy team_photo_likes_delete on public.team_photo_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy team_photo_comments_read on public.team_photo_comments for select to authenticated
  using (exists (select 1 from public.team_photos t where t.id = photo_id));
create policy team_photo_comments_insert on public.team_photo_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.team_photos t where t.id = photo_id));
create policy team_photo_comments_delete_own on public.team_photo_comments for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.team_photos, public.team_photo_likes, public.team_photo_comments from anon, authenticated;
grant select, delete on public.team_photos to authenticated;
grant insert (media_path, caption) on public.team_photos to authenticated;
grant select, delete on public.team_photo_likes to authenticated;
grant insert (photo_id) on public.team_photo_likes to authenticated;
grant select, delete on public.team_photo_comments to authenticated;
grant insert (photo_id, body) on public.team_photo_comments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stand', 'stand', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy stand_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'stand' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy stand_files_read on storage.objects for select to authenticated using (
  bucket_id = 'stand'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (select 1 from public.team_photos t where t.media_path = name)
  )
);
create policy stand_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'stand' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- ---------- player ratings ----------
create table public.player_ratings (
  player_id   text not null references public.players (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  review      varchar(200) not null default '',
  nick        varchar(20) not null default '',  -- stamped
  updated_at  timestamptz not null default now(),
  primary key (player_id, user_id)
);
create index player_ratings_player_recent_idx on public.player_ratings (player_id, updated_at desc);

-- Written only by the trigger below.
create table public.player_rating_stats (
  player_id  text primary key references public.players (id) on delete cascade,
  sum        integer not null default 0,
  count      integer not null default 0,
  d1 integer not null default 0, d2 integer not null default 0, d3 integer not null default 0,
  d4 integer not null default 0, d5 integer not null default 0
);

create function public.player_ratings_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if not exists (select 1 from public.players pl where pl.id = new.player_id and pl.team_id = fan.team_id) then
    raise exception 'not_your_player' using errcode = '42501';
  end if;
  new.nick := fan.nick;
  new.review := btrim(new.review);
  new.updated_at := now();
  return new;
end $$;
create trigger player_ratings_stamp before insert or update on public.player_ratings
  for each row execute function public.player_ratings_stamp();

create function public.player_rating_stats_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.player_rating_stats set
      sum = sum - old.stars, count = count - 1,
      d1 = d1 - (old.stars = 1)::int, d2 = d2 - (old.stars = 2)::int, d3 = d3 - (old.stars = 3)::int,
      d4 = d4 - (old.stars = 4)::int, d5 = d5 - (old.stars = 5)::int
    where player_id = old.player_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.player_rating_stats (player_id, sum, count, d1, d2, d3, d4, d5)
    values (new.player_id, new.stars, 1, (new.stars = 1)::int, (new.stars = 2)::int, (new.stars = 3)::int,
            (new.stars = 4)::int, (new.stars = 5)::int)
    on conflict (player_id) do update set
      sum = public.player_rating_stats.sum + excluded.sum,
      count = public.player_rating_stats.count + 1,
      d1 = public.player_rating_stats.d1 + excluded.d1, d2 = public.player_rating_stats.d2 + excluded.d2,
      d3 = public.player_rating_stats.d3 + excluded.d3, d4 = public.player_rating_stats.d4 + excluded.d4,
      d5 = public.player_rating_stats.d5 + excluded.d5;
  end if;
  return null;
end $$;
create trigger player_rating_stats_apply after insert or update of stars or delete on public.player_ratings
  for each row execute function public.player_rating_stats_apply();

alter table public.player_ratings      enable row level security;
alter table public.player_rating_stats enable row level security;

-- Ratings and reviews stay inside the club.
create policy player_ratings_read on public.player_ratings for select to authenticated
  using (exists (select 1 from public.players pl where pl.id = player_id and pl.team_id = (select public.my_team())));
create policy player_ratings_insert on public.player_ratings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy player_ratings_update on public.player_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy player_ratings_delete on public.player_ratings for delete to authenticated using (user_id = (select auth.uid()));
create policy player_rating_stats_read on public.player_rating_stats for select to authenticated
  using (exists (select 1 from public.players pl where pl.id = player_id and pl.team_id = (select public.my_team())));

revoke all on public.player_ratings, public.player_rating_stats from anon, authenticated;
grant select, delete on public.player_ratings to authenticated;
grant insert (player_id, stars, review) on public.player_ratings to authenticated;
grant update (stars, review) on public.player_ratings to authenticated;
grant select on public.player_rating_stats to authenticated;
