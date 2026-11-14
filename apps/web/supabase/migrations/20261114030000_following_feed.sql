-- The "following" feed (owner 2026-11-14): clips from the fans I follow, surfaced to me — across clubs. A SECURITY
-- DEFINER function returns the live clips of everyone I follow, newest first, with my own like/respect state baked in,
-- so the feed opens a rival's clip without loosening the club-scoped RLS on clips. The media file itself is signed in
-- the server query layer with the service role (the clip bucket is club-scoped too). Runs after the 10/15 hardening, so
-- the function is revoked from PUBLIC and granted only to authenticated.
create function public.following_clips(p_limit integer default 10, p_offset integer default 0)
returns table (
  id uuid, user_id uuid, team_id text, nick text, media_path text, kind text, caption text, captions jsonb,
  filter text, speed real, trim_start real, trim_end real, tags text, once boolean, likes_count integer,
  respects_count integer, comments_count integer, views_count integer, created_at timestamptz, expires_at timestamptz,
  audience text, i_liked boolean, i_respected boolean
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.user_id, c.team_id, c.nick::text, c.media_path, c.kind, c.caption::text, c.captions, c.filter, c.speed,
    c.trim_start, c.trim_end, c.tags::text, c.once, c.likes_count, c.respects_count, c.comments_count, c.views_count,
    c.created_at, c.expires_at, c.audience,
    exists (select 1 from public.clip_likes l where l.clip_id = c.id and l.user_id = (select auth.uid())) as i_liked,
    exists (select 1 from public.clip_respects r where r.clip_id = c.id and r.user_id = (select auth.uid())) as i_respected
  from public.clips c
  where c.user_id in (select f.followee_id from public.follows f where f.follower_id = (select auth.uid()))
    and c.expires_at > now()
    and not c.once  -- view-once clips are never surfaced in a feed
  order by c.created_at desc
  limit greatest(0, least(p_limit, 50)) offset greatest(0, p_offset);
$$;
revoke all on function public.following_clips(integer, integer) from public, anon, authenticated;
grant execute on function public.following_clips(integer, integer) to authenticated;
