-- P2: the Square ("הכיכר"). League-wide photos and videos that live 24 hours.
-- Likes from anyone, "respect" (כבוד) only from fans of other clubs, comments, view-once posts.
-- Media in the private Storage bucket "clips" under "<user id>/<file>"; fans get short-lived signed URLs.
-- Expired posts are hidden by RLS at once and removed (rows + files) by the hourly cleanup job.

create table public.clips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id         text not null default public.my_team() references public.teams (id),  -- stamped
  nick            varchar(20) not null default '',                                         -- stamped
  media_path      text not null unique,
  kind            text not null check (kind in ('image', 'video')),
  caption         varchar(120) not null default '',
  tags            varchar(60) not null default '',
  once            boolean not null default false,
  likes_count     integer not null default 0,
  respects_count  integer not null default 0,
  comments_count  integer not null default 0,
  views_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours'
);
create index clips_feed_idx on public.clips (created_at desc, id desc);
create index clips_team_feed_idx on public.clips (team_id, created_at desc, id desc);
create index clips_expires_idx on public.clips (expires_at);
create index clips_user_created_idx on public.clips (user_id, created_at desc);

create table public.clip_views (
  clip_id    uuid not null references public.clips (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (clip_id, user_id)
);
create index clip_views_user_idx on public.clip_views (user_id, clip_id);

create table public.clip_likes (
  clip_id  uuid not null references public.clips (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (clip_id, user_id)
);
create index clip_likes_user_idx on public.clip_likes (user_id, clip_id);

create table public.clip_respects (
  clip_id  uuid not null references public.clips (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (clip_id, user_id)
);
create index clip_respects_user_idx on public.clip_respects (user_id, clip_id);

create table public.clip_comments (
  id          uuid primary key default gen_random_uuid(),
  clip_id     uuid not null references public.clips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id     text not null default public.my_team() references public.teams (id),  -- stamped
  nick        varchar(20) not null default '',                                         -- stamped
  body        varchar(150) not null check (char_length(btrim(body)) between 1 and 150),
  created_at  timestamptz not null default now()
);
create index clip_comments_clip_idx on public.clip_comments (clip_id, created_at, id);
create index clip_comments_user_idx on public.clip_comments (user_id, created_at desc);

-- ---------- stamping and limits ----------
create function public.clips_stamp() returns trigger
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
  new.tags := btrim(new.tags);
  new.likes_count := 0;
  new.respects_count := 0;
  new.comments_count := 0;
  new.views_count := 0;
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  if (select count(*) from public.clips c where c.user_id = new.user_id and c.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger clips_stamp before insert on public.clips for each row execute function public.clips_stamp();

create function public.clip_comments_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  new.team_id := fan.team_id;
  new.nick := fan.nick;
  new.body := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.clip_comments c where c.user_id = new.user_id and c.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger clip_comments_stamp before insert on public.clip_comments for each row execute function public.clip_comments_stamp();

-- ---------- counters (kept by triggers, never by clients) ----------
create function public.clip_counter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  target uuid := case when tg_op = 'INSERT' then new.clip_id else old.clip_id end;
begin
  if tg_table_name = 'clip_likes' then
    update public.clips set likes_count = greatest(likes_count + delta, 0) where id = target;
  elsif tg_table_name = 'clip_respects' then
    update public.clips set respects_count = greatest(respects_count + delta, 0) where id = target;
  elsif tg_table_name = 'clip_comments' then
    update public.clips set comments_count = greatest(comments_count + delta, 0) where id = target;
  elsif tg_table_name = 'clip_views' then
    update public.clips set views_count = views_count + 1 where id = target;
  end if;
  return null;
end $$;
create trigger clip_likes_count after insert or delete on public.clip_likes for each row execute function public.clip_counter();
create trigger clip_respects_count after insert or delete on public.clip_respects for each row execute function public.clip_counter();
create trigger clip_comments_count after insert or delete on public.clip_comments for each row execute function public.clip_counter();
create trigger clip_views_count after insert on public.clip_views for each row execute function public.clip_counter();

-- ---------- row level security ----------
alter table public.clips         enable row level security;
alter table public.clip_views    enable row level security;
alter table public.clip_likes    enable row level security;
alter table public.clip_respects enable row level security;
alter table public.clip_comments enable row level security;

-- Has the current fan already viewed this post? security definer so the clips policy does not re-enter the
-- clip_views policy (which itself checks clips): that loop is "infinite recursion detected in policy".
create function public.clip_seen(p_clip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clip_views v where v.clip_id = p_clip and v.user_id = auth.uid())
$$;
revoke all on function public.clip_seen(uuid) from public;
grant execute on function public.clip_seen(uuid) to authenticated;

-- Visible while alive; a view-once post disappears for a fan after their first view (the owner always sees it).
create policy clips_read on public.clips for select to authenticated using (
  expires_at > now()
  and (not once or user_id = (select auth.uid()) or not public.clip_seen(id))
);
create policy clips_insert on public.clips for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy clips_delete_own on public.clips for delete to authenticated using (user_id = (select auth.uid()));

create policy clip_views_read_own on public.clip_views for select to authenticated using (user_id = (select auth.uid()));
create policy clip_views_insert on public.clip_views for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.clips c where c.id = clip_id));

create policy clip_likes_read_own on public.clip_likes for select to authenticated using (user_id = (select auth.uid()));
create policy clip_likes_insert on public.clip_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.clips c where c.id = clip_id));
create policy clip_likes_delete on public.clip_likes for delete to authenticated using (user_id = (select auth.uid()));

-- Respect is for rivals: only fans of a different club.
create policy clip_respects_read_own on public.clip_respects for select to authenticated using (user_id = (select auth.uid()));
create policy clip_respects_insert on public.clip_respects for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.clips c where c.id = clip_id and c.team_id <> (select public.my_team()))
  );
create policy clip_respects_delete on public.clip_respects for delete to authenticated using (user_id = (select auth.uid()));

create policy clip_comments_read on public.clip_comments for select to authenticated
  using (exists (select 1 from public.clips c where c.id = clip_id));
create policy clip_comments_insert on public.clip_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and team_id = (select public.my_team())
    and exists (select 1 from public.clips c where c.id = clip_id)
  );
create policy clip_comments_delete_own on public.clip_comments for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.clips, public.clip_views, public.clip_likes, public.clip_respects, public.clip_comments from anon, authenticated;
grant select, delete on public.clips to authenticated;
grant insert (media_path, kind, caption, tags, once) on public.clips to authenticated;
grant select on public.clip_views to authenticated;
grant insert (clip_id) on public.clip_views to authenticated;
grant select, delete on public.clip_likes, public.clip_respects to authenticated;
grant insert (clip_id) on public.clip_likes, public.clip_respects to authenticated;
grant select, delete on public.clip_comments to authenticated;
grant insert (clip_id, body) on public.clip_comments to authenticated;
-- The cleanup job (secret key) removes expired posts and their files.
grant select, delete on public.clips to service_role;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload only into your own folder.
create policy clips_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- Read (sign) a file only while its post is visible to you, or your own files.
create policy clips_files_read on storage.objects for select to authenticated using (
  bucket_id = 'clips'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (select 1 from public.clips c where c.media_path = name)
  )
);
create policy clips_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid()::text));
