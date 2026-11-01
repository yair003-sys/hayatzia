-- Per-post comment threads on channel posts (2026-11-01). A post's discussion lives in its own thread, separate from
-- the group chat stream. Club + nick + time are stamped from the fan's profile; the fan sends only text. Body passes
-- moderation and a 5-per-10s rate limit. The post's comments_count is kept by trigger; each new comment is broadcast
-- live on the post's own topic.

create table public.channel_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.channel_posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id    text not null default '',                          -- stamped from the post
  nick       varchar(20) not null default '',                   -- stamped from the profile
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index channel_post_comments_thread_idx on public.channel_post_comments (post_id, created_at desc, id desc);

-- Stamp club (from the post) + user + nick + time; refuse a comment on another club's post; rate-limit 5/10s.
create function public.channel_post_comments_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record; fan record;
begin
  new.user_id := (select auth.uid());
  select t.team_id into p from public.channel_posts t where t.id = new.post_id;
  if not found then
    raise exception 'no_post' using errcode = '23503';
  end if;
  if p.team_id <> (select public.my_team()) then
    raise exception 'not_your_club' using errcode = '42501';
  end if;
  select pr.nick into fan from public.profiles pr where pr.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  new.team_id    := p.team_id;
  new.nick       := fan.nick;
  new.body       := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.channel_post_comments c
        where c.user_id = new.user_id and c.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.channel_post_comments_stamp() from public, anon, authenticated;
create trigger channel_post_comments_stamp before insert on public.channel_post_comments
  for each row execute function public.channel_post_comments_stamp();

-- Moderation on the body (after the stamp).
create trigger zz_moderate before insert or update on public.channel_post_comments
  for each row execute function private.moderate_row('body:text');

-- Keep comments_count on the post, and broadcast each new comment to the post's own topic.
create function public.channel_post_comments_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid := case when tg_op = 'INSERT' then new.post_id else old.post_id end;
begin
  update public.channel_posts set comments_count = greatest(comments_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
    where id = pid;
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'post_id', new.post_id, 'user_id', new.user_id,
                         'nick', new.nick, 'body', new.body, 'created_at', new.created_at),
      'COMMENT', 'newspost:' || new.post_id::text, true);
  end if;
  return null;
end $$;
revoke all on function public.channel_post_comments_count() from public, anon, authenticated;
create trigger channel_post_comments_count after insert or delete on public.channel_post_comments
  for each row execute function public.channel_post_comments_count();

alter table public.channel_post_comments enable row level security;
create policy channel_post_comments_read on public.channel_post_comments for select to authenticated
  using (team_id = (select public.my_team()));
create policy channel_post_comments_insert on public.channel_post_comments for insert to authenticated
  with check (user_id = (select auth.uid()));
-- a fan removes their own comment; a channel admin may remove any comment on their club's post.
create policy channel_post_comments_delete on public.channel_post_comments for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_post_channel(team_id));

revoke all on public.channel_post_comments from anon, authenticated;
grant select, delete on public.channel_post_comments to authenticated;
grant insert (post_id, body) on public.channel_post_comments to authenticated;

-- Realtime authorization: a fan may receive a post's comment broadcasts when the post belongs to their club.
create policy channel_post_comments_receive on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'newspost:%'
    and exists (
      select 1 from public.channel_posts p
      where p.id = nullif(split_part(realtime.topic(), ':', 2), '')::uuid
        and p.team_id = (select public.my_team())
    )
  );
