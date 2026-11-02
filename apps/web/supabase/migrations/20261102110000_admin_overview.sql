-- Admin overview console (owner, 2026-11-02): a general operator console to see everything across all clubs and act,
-- beyond the report queue. These read functions browse every club's rows; like the moderation RPCs they are
-- SECURITY DEFINER and refuse anyone who is not an app admin ('not_admin'). Acting reuses admin_remove_content and
-- admin_ban_user/admin_unban_user; the one new action is removing a club-news post, which is not a report kind.

-- ---------- counts at a glance ----------
-- One row per metric. bigint so the counts never overflow as the app grows.
create function public.admin_overview_counts()
returns table (metric text, value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
             select 'fans'::text,          count(*)::bigint from public.profiles
   union all select 'fans_verified'::text, count(*)::bigint from public.profiles where adult_confirmed_at is not null
   union all select 'clips'::text,         count(*)::bigint from public.clips
   union all select 'trips'::text,         count(*)::bigint from public.trips
   union all select 'channel_posts'::text, count(*)::bigint from public.channel_posts
   union all select 'ratings'::text,       count(*)::bigint from public.player_ratings
   union all select 'open_reports'::text,  count(*)::bigint from public.reports where status = 'open'
   union all select 'active_bans'::text,   count(*)::bigint from public.fan_bans where until is null or until > now();
end $$;

-- Fans per club, biggest first (every club shown, even with zero fans).
create function public.admin_fans_by_team()
returns table (team_id text, team_name text, fans bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select t.id, t.name::text, count(p.user_id)::bigint
      from public.teams t
      left join public.profiles p on p.team_id = t.id
     group by t.id, t.name, t.sort
     order by count(p.user_id) desc, t.sort;
end $$;

-- All fans across all clubs, newest first (keyset by created_at, user_id). Optional search by nickname and club filter.
create function public.admin_user_list(
  p_search text default null, p_team text default null, p_limit int default 30,
  p_before timestamptz default null, p_before_id uuid default null)
returns table (user_id uuid, nick text, team_id text, team_name text, created_at timestamptz,
               verified boolean, banned boolean, ban_until timestamptz, is_admin boolean, clips_posted int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select p.user_id, p.nick::text, p.team_id, t.name::text, p.created_at,
           p.adult_confirmed_at is not null,
           exists (select 1 from public.fan_bans b where b.user_id = p.user_id and (b.until is null or b.until > now())),
           (select b.until from public.fan_bans b where b.user_id = p.user_id),
           exists (select 1 from public.app_admins a where a.user_id = p.user_id),
           p.clips_posted
      from public.profiles p
      join public.teams t on t.id = p.team_id
     where (p_team is null or p.team_id = p_team)
       and (p_search is null or btrim(p_search) = '' or p.nick ilike '%' || btrim(p_search) || '%')
       and (p_before is null or p.created_at < p_before
            or (p_before_id is not null and p.created_at = p_before and p.user_id < p_before_id))
     order by p.created_at desc, p.user_id desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end $$;

-- The latest content of one kind across all clubs, newest first (keyset by created_at and a text ref).
-- ref is what admin_remove_content / admin_remove_channel_post take: a clip/trip id, 'player:author' for a review,
-- or a channel-post id. preview is a plain-text excerpt, never anything from a private message.
create function public.admin_content_feed(
  p_kind text, p_limit int default 30, p_before timestamptz default null, p_before_id text default null)
returns table (ref text, kind text, author_id uuid, author_nick text, team_id text, team_name text,
               preview text, created_at timestamptz, hidden boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_kind = 'clip' then
    return query
      select c.id::text, 'clip'::text, c.user_id, c.nick::text, c.team_id, t.name::text,
             (case when c.kind = 'video' then 'סרטון' else 'תמונה' end
               || case when c.caption <> '' then ': ' || c.caption else '' end
               || case when c.tags <> '' then ' · ' || c.tags else '' end)::text,
             c.created_at, c.hidden_at is not null
        from public.clips c
        join public.teams t on t.id = c.team_id
       where (p_before is null or c.created_at < p_before
              or (p_before_id is not null and c.created_at = p_before and c.id::text < p_before_id))
       order by c.created_at desc, c.id::text desc
       limit v_limit;
  elsif p_kind = 'trip' then
    return query
      select tr.id::text, 'trip'::text, tr.user_id, tr.nick::text, tr.team_id, t.name::text,
             (tr.from_city || case when tr.note <> '' then ' · ' || tr.note else '' end)::text,
             tr.created_at, tr.hidden_at is not null
        from public.trips tr
        join public.teams t on t.id = tr.team_id
       where (p_before is null or tr.created_at < p_before
              or (p_before_id is not null and tr.created_at = p_before and tr.id::text < p_before_id))
       order by tr.created_at desc, tr.id::text desc
       limit v_limit;
  elsif p_kind = 'channel_post' then
    return query
      select cp.id::text, 'channel_post'::text, cp.author_id, pr.nick::text, cp.team_id, t.name::text,
             coalesce(nullif(cp.title, ''), left(regexp_replace(cp.body, '\s+', ' ', 'g'), 120))::text,
             cp.created_at, false
        from public.channel_posts cp
        join public.teams t on t.id = cp.team_id
        left join public.profiles pr on pr.user_id = cp.author_id
       where (p_before is null or cp.created_at < p_before
              or (p_before_id is not null and cp.created_at = p_before and cp.id::text < p_before_id))
       order by cp.created_at desc, cp.id::text desc
       limit v_limit;
  elsif p_kind = 'review' then
    return query
      select (r.player_id || ':' || r.user_id::text), 'review'::text, r.user_id, r.nick::text, p.team_id, t.name::text,
             (r.stars || '★' || case when r.review <> '' then ' ' || r.review else '' end)::text,
             r.updated_at, r.hidden_at is not null
        from public.player_ratings r
        join public.profiles p on p.user_id = r.user_id
        join public.teams t on t.id = p.team_id
       where (p_before is null or r.updated_at < p_before
              or (p_before_id is not null and r.updated_at = p_before and (r.player_id || ':' || r.user_id::text) < p_before_id))
       order by r.updated_at desc, (r.player_id || ':' || r.user_id::text) desc
       limit v_limit;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
end $$;

-- Remove a club-news post (not a report kind, so admin_remove_content does not cover it). Returns the Storage file to
-- delete, if any, the way admin_remove_content does; the server action removes it with the service key. Audited.
create function public.admin_remove_channel_post(p_id uuid)
returns table (removed boolean, bucket text, path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_path text;
  v_removed boolean;
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from public.channel_posts c where c.id = p_id returning c.author_id, c.media_path into v_author, v_path;
  v_removed := found;
  insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
    values (auth.uid(), 'remove', 'channel_post', left(p_id::text, 100), v_author,
            case when v_removed then '' else 'already gone' end);
  return query select v_removed, case when v_path is null then null else 'channel' end, v_path;
end $$;

revoke all on function public.admin_overview_counts() from public, anon;
revoke all on function public.admin_fans_by_team() from public, anon;
revoke all on function public.admin_user_list(text, text, int, timestamptz, uuid) from public, anon;
revoke all on function public.admin_content_feed(text, int, timestamptz, text) from public, anon;
revoke all on function public.admin_remove_channel_post(uuid) from public, anon;
grant execute on function public.admin_overview_counts() to authenticated;
grant execute on function public.admin_fans_by_team() to authenticated;
grant execute on function public.admin_user_list(text, text, int, timestamptz, uuid) to authenticated;
grant execute on function public.admin_content_feed(text, int, timestamptz, text) to authenticated;
grant execute on function public.admin_remove_channel_post(uuid) to authenticated;
