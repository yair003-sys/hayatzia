-- "Song Greenhouse" (חממת השירים), stage 1. A fan records a chant they wrote (audio) + its lyrics and posts it to
-- their club's greenhouse; other fans of the club like it and "adopt" it — a public commitment to sing it in the
-- stand. Adoptions and likes drive a weekly chart (stage 2). Songs persist (unlike the 24h Square clips).
-- Audio lives in the private "songs" bucket under "<user id>/<file>"; fans get short-lived signed URLs.
-- Everything club-scoped: a fan only ever sees, likes or adopts their own club's songs.

create table public.songs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id       text not null default public.my_team() references public.teams (id),  -- stamped
  nick          varchar(20) not null default '',                                         -- stamped
  audio_path    text not null unique,
  title         varchar(80) not null default '',
  lyrics        varchar(2000) not null default '',
  likes_count   integer not null default 0,
  adopts_count  integer not null default 0,
  created_at    timestamptz not null default now()
);
create index songs_team_feed_idx on public.songs (team_id, created_at desc, id desc);
create index songs_user_created_idx on public.songs (user_id, created_at desc);
-- the weekly chart ranks by adoptions, then likes (stage 2)
create index songs_team_chart_idx on public.songs (team_id, adopts_count desc, likes_count desc, created_at desc);

create table public.song_likes (
  song_id uuid not null references public.songs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (song_id, user_id)
);
create index song_likes_user_idx on public.song_likes (user_id, song_id);

-- An "adoption": a fan commits to singing the song in the stand. The counter under it is the whole point.
create table public.song_adopts (
  song_id    uuid not null references public.songs (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  adopted_at timestamptz not null default now(),
  primary key (song_id, user_id)
);
create index song_adopts_user_idx on public.song_adopts (user_id, song_id);

-- ---------- stamping and limits ----------
create function public.songs_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if split_part(new.audio_path, '/', 1) <> new.user_id::text then
    raise exception 'audio must be in your own folder' using errcode = '42501';
  end if;
  new.team_id := fan.team_id;
  new.nick := fan.nick;
  new.title := btrim(new.title);
  new.lyrics := btrim(new.lyrics);
  new.likes_count := 0;
  new.adopts_count := 0;
  new.created_at := now();
  -- recording a song is effortful; a gentle cap keeps the greenhouse from being flooded
  if (select count(*) from public.songs s where s.user_id = new.user_id and s.created_at > now() - interval '1 hour') >= 6 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger songs_stamp before insert on public.songs for each row execute function public.songs_stamp();

-- ---------- counters (kept by triggers, never by clients) ----------
create function public.song_counter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  target uuid := case when tg_op = 'INSERT' then new.song_id else old.song_id end;
begin
  if tg_table_name = 'song_likes' then
    update public.songs set likes_count = greatest(likes_count + delta, 0) where id = target;
  elsif tg_table_name = 'song_adopts' then
    update public.songs set adopts_count = greatest(adopts_count + delta, 0) where id = target;
  end if;
  return null;
end $$;
create trigger song_likes_count after insert or delete on public.song_likes for each row execute function public.song_counter();
create trigger song_adopts_count after insert or delete on public.song_adopts for each row execute function public.song_counter();

-- lyrics and title pass the shared moderation trigger
create trigger zz_moderate before insert or update on public.songs
  for each row execute function private.moderate_row('title:text', 'lyrics:text');

-- ---------- row level security ----------
alter table public.songs       enable row level security;
alter table public.song_likes  enable row level security;
alter table public.song_adopts enable row level security;

-- A fan sees only their own club's greenhouse.
create policy songs_read on public.songs for select to authenticated using (team_id = (select public.my_team()));
create policy songs_insert on public.songs for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy songs_delete_own on public.songs for delete to authenticated using (user_id = (select auth.uid()));

-- Likes / adopts: your own row, on a song you can see (its RLS limits it to your club).
create policy song_likes_read_own on public.song_likes for select to authenticated using (user_id = (select auth.uid()));
create policy song_likes_insert on public.song_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.songs s where s.id = song_id));
create policy song_likes_delete on public.song_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy song_adopts_read_own on public.song_adopts for select to authenticated using (user_id = (select auth.uid()));
create policy song_adopts_insert on public.song_adopts for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.songs s where s.id = song_id));
create policy song_adopts_delete on public.song_adopts for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.songs, public.song_likes, public.song_adopts from anon, authenticated;
grant select, delete on public.songs to authenticated;
grant insert (audio_path, title, lyrics) on public.songs to authenticated;
grant select, delete on public.song_likes, public.song_adopts to authenticated;
grant insert (song_id) on public.song_likes, public.song_adopts to authenticated;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('songs', 'songs', false, 20971520,
        array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy songs_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'songs' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy songs_files_read on storage.objects for select to authenticated using (
  bucket_id = 'songs'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (select 1 from public.songs s where s.audio_path = name)
  )
);
create policy songs_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = (select auth.uid()::text));
