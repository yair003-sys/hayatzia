-- Team news channel (owner 2026-11-01, spec docs/superpowers/specs/2026-10-31-news-channel-design.md).
-- A per-club channel that only admins post to. Each post = title (optional) + body + optional one media item.
-- Fans read their own club's posts (RLS via my_team()); writing a post requires being a channel admin of that club
-- (a row in team_channel_admins) or a global app admin. Club + author + timestamps are server-stamped, never sent by
-- the client. Body/title pass the existing moderation trigger. Counters (views/reactions/comments) live on the row and
-- are kept by triggers added in the following migrations.

-- Who may post to a club's channel. Seeded by hand in the SQL editor (no self-grant UI in the MVP), like app_admins.
create table public.team_channel_admins (
  team_id    text not null references public.teams (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.team_channel_admins enable row level security;  -- no policies: read only through can_post_channel()
revoke all on public.team_channel_admins from public, anon, authenticated;

-- Posting permission for a club: a channel admin of that club, or a global app admin.
create function public.can_post_channel(p_team text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_admin()
      or exists (select 1 from public.team_channel_admins a
                 where a.team_id = p_team and a.user_id = (select auth.uid()))
$$;
revoke all on function public.can_post_channel(text) from public, anon;
grant execute on function public.can_post_channel(text) to authenticated;

-- Client-facing "may I post to my own club?" (no club argument needed from the browser).
create function public.channel_can_post() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_post_channel((select public.my_team()))
$$;
revoke all on function public.channel_can_post() from public, anon;
grant execute on function public.channel_can_post() to authenticated;

create table public.channel_posts (
  id             uuid primary key default gen_random_uuid(),
  team_id        text not null references public.teams (id),
  author_id      uuid not null references auth.users (id) on delete cascade,
  title          text,
  body           text not null check (char_length(body) between 1 and 1000),
  media_path     text,
  media_kind     text check (media_kind in ('image', 'video')),
  views_count    integer not null default 0,
  reactions      jsonb   not null default '{}'::jsonb,   -- {emoji: count}, kept by the reactions-count trigger
  comments_count integer not null default 0,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz
);
create index channel_posts_feed_idx on public.channel_posts (team_id, created_at desc, id desc);

-- Stamp club + author + timestamps from the session; a post only carries content the admin typed. Enforces that the
-- author may post to the (server-chosen) club, so a cross-club team_id can never slip in.
create function public.channel_posts_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.team_id    := (select public.my_team());
    new.author_id  := (select auth.uid());
    new.created_at := now();
    new.edited_at  := null;
    if not public.can_post_channel(new.team_id) then
      raise exception 'not_channel_admin' using errcode = '42501';
    end if;
  else
    new.team_id    := old.team_id;
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    new.edited_at  := now();
  end if;
  return new;
end $$;
revoke all on function public.channel_posts_stamp() from public, anon, authenticated;
create trigger channel_posts_stamp before insert or update on public.channel_posts
  for each row execute function public.channel_posts_stamp();

-- Moderation runs after the stamp (zz_ prefix sorts last among BEFORE triggers), on the free-text columns.
create trigger zz_moderate before insert or update on public.channel_posts
  for each row execute function private.moderate_row('title:name', 'body:text');

alter table public.channel_posts enable row level security;
create policy channel_posts_read on public.channel_posts for select to authenticated
  using (team_id = (select public.my_team()));
create policy channel_posts_insert on public.channel_posts for insert to authenticated
  with check (public.can_post_channel((select public.my_team())));
create policy channel_posts_update on public.channel_posts for update to authenticated
  using (public.can_post_channel(team_id)) with check (public.can_post_channel(team_id));
create policy channel_posts_delete on public.channel_posts for delete to authenticated
  using (public.can_post_channel(team_id));

revoke all on public.channel_posts from anon, authenticated;
grant select on public.channel_posts to authenticated;
grant insert (title, body, media_path, media_kind) on public.channel_posts to authenticated;  -- club/author/counters stamped
grant update (title, body) on public.channel_posts to authenticated;
grant delete on public.channel_posts to authenticated;
