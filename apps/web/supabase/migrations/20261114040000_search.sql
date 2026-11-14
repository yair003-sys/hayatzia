-- In-app search (owner 2026-11-14): one smart, cross-club search over people, wall posts and Square clips. Matching is
-- a case-insensitive substring (reliable for Hebrew, where Postgres has no stemming dictionary), accelerated by trigram
-- GIN indexes; ranking is a blended score — text similarity + popularity + recency + a small "official" lift — so the
-- best result floats to the top, not just the newest. Each entity has its own SECURITY DEFINER function so results cross
-- clubs without loosening any table's RLS, and clips respect their audience (a club-only clip never leaks to a rival).
-- Songs search waits until the greenhouse ships to production.
create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_nick_trgm      on public.profiles      using gin (nick extensions.gin_trgm_ops);
create index if not exists channel_posts_body_trgm  on public.channel_posts using gin (body extensions.gin_trgm_ops);
create index if not exists clips_caption_trgm        on public.clips         using gin (caption extensions.gin_trgm_ops);
create index if not exists clips_tags_trgm           on public.clips         using gin (tags extensions.gin_trgm_ops);

-- ---------- people ----------
create function public.search_fans(q text, p_limit integer default 20)
returns table (user_id uuid, nick text, team_id text, avatar_path text, followers_count integer, score real)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.nick::text, p.team_id, p.avatar_path, p.followers_count,
    (extensions.similarity(p.nick, q)
      + case when p.nick ilike q || '%' then 0.4 else 0 end     -- a prefix hit is what people usually mean
      + ln(1 + p.followers_count) / 20.0)::real as score        -- a nudge for the fans others follow
  from public.profiles p
  where length(btrim(q)) >= 1 and p.nick ilike '%' || q || '%' and p.team_id <> 'onf'
  order by score desc, p.followers_count desc, p.nick
  limit greatest(0, least(p_limit, 50));
$$;
revoke all on function public.search_fans(text, integer) from public, anon, authenticated;
grant execute on function public.search_fans(text, integer) to authenticated;

-- ---------- wall posts ----------
create function public.search_posts(q text, p_limit integer default 20)
returns table (id uuid, team_id text, author_id uuid, author_nick text, title text, body text, official boolean, created_at timestamptz, score real)
language sql stable security definer set search_path = public as $$
  select c.id, c.team_id, c.author_id, pr.nick::text as author_nick, c.title, c.body, c.official, c.created_at,
    (extensions.similarity(c.body, q)
      + case when c.official then 0.2 else 0 end                                  -- official posts count a little more
      + 1.0 / (1 + extract(epoch from (now() - c.created_at)) / 86400.0))::real as score  -- fresher ranks higher
  from public.channel_posts c join public.profiles pr on pr.user_id = c.author_id
  where length(btrim(q)) >= 1 and (c.body ilike '%' || q || '%' or coalesce(c.title, '') ilike '%' || q || '%')
  order by score desc, c.created_at desc
  limit greatest(0, least(p_limit, 50));
$$;
revoke all on function public.search_posts(text, integer) from public, anon, authenticated;
grant execute on function public.search_posts(text, integer) to authenticated;

-- ---------- Square clips ----------
-- Same public clip shape as the following feed, with my own like/respect baked in. Only league-wide clips
-- (audience 'all' or 'both') cross clubs; a club-only clip is never searchable from another club.
create function public.search_clips(q text, p_limit integer default 20)
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
  where length(btrim(q)) >= 1
    and c.expires_at > now() and not c.once and c.hidden_at is null
    and c.audience in ('all', 'both')
    and (c.caption ilike '%' || q || '%' or c.tags ilike '%' || q || '%')
  order by
    (extensions.similarity(coalesce(c.caption, '') || ' ' || coalesce(c.tags, ''), q)
      + ln(1 + c.likes_count + c.respects_count) / 10.0
      + 1.0 / (1 + extract(epoch from (now() - c.created_at)) / 3600.0)) desc,
    c.created_at desc
  limit greatest(0, least(p_limit, 50));
$$;
revoke all on function public.search_clips(text, integer) from public, anon, authenticated;
grant execute on function public.search_clips(text, integer) to authenticated;
