-- The wall: open the club channel to fans (redesign phase 3, 2026-11-06).
-- Until now only channel admins could post; the wall makes the channel the club's social feed, so any member may post
-- to their OWN club's wall. A post by someone with posting permission (a channel admin / app admin) is marked
-- `official` and wears the club tick; a fan's post is not. Fan posts are rate-limited (admins are not) and still pass
-- the moderation trigger. Club + author + time + official are server-stamped — the client only sends content.
-- Moderation power stays with admins: an admin may edit/delete any post in their club; a fan only their own.

alter table public.channel_posts add column official boolean not null default false;

-- Every post that already exists was made under the old admin-only policy, so it is official.
update public.channel_posts set official = true;

-- Rate-limit lookups for fan posting (admins are not limited, but the count is cheap and shared).
create index channel_posts_author_created_idx on public.channel_posts (author_id, created_at desc);

-- Re-stamp: club + author + time from the session, mark official by posting permission, rate-limit fans.
create or replace function public.channel_posts_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.team_id    := (select public.my_team());
    new.author_id  := (select auth.uid());
    new.created_at := now();
    new.edited_at  := null;
    if new.team_id is null then
      raise exception 'no_team' using errcode = '42501';   -- you must belong to a club to post
    end if;
    new.official   := public.can_post_channel(new.team_id);
    if not new.official then
      -- fans: at most 4 posts per 5 minutes (official/admin posts are never limited)
      if (select count(*) from public.channel_posts p
          where p.author_id = new.author_id and p.created_at > now() - interval '5 minutes') >= 4 then
        raise exception 'rate_limit' using errcode = 'P0001';
      end if;
    end if;
  else
    new.team_id    := old.team_id;
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    new.official   := old.official;   -- a post's official standing never changes on edit
    new.edited_at  := now();
  end if;
  return new;
end $$;

-- Insert: any authenticated club member may post to their own club (official is stamped, never sent).
drop policy channel_posts_insert on public.channel_posts;
create policy channel_posts_insert on public.channel_posts for insert to authenticated
  with check (team_id = (select public.my_team()) and author_id = (select auth.uid()));

-- Update / delete: the author (their own post) or a channel admin of the post's club (moderation).
drop policy channel_posts_update on public.channel_posts;
create policy channel_posts_update on public.channel_posts for update to authenticated
  using (author_id = (select auth.uid()) or public.can_post_channel(team_id))
  with check (author_id = (select auth.uid()) or public.can_post_channel(team_id));
drop policy channel_posts_delete on public.channel_posts;
create policy channel_posts_delete on public.channel_posts for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_post_channel(team_id));
