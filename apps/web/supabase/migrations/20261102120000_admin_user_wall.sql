-- Admin user wall (owner, 2026-11-02): from the console user list, open one fan's wall — their profile header with
-- counts, and their own content across kinds. Both functions are is_app_admin-gated and SECURITY DEFINER, like the
-- rest of the console. admin_user_content mirrors admin_content_feed but filtered to one author.

-- The header: one row with the fan's profile, standing (verified/banned/admin) and how much they have posted.
create function public.admin_user_detail(p_user uuid)
returns table (user_id uuid, nick text, team_id text, team_name text, created_at timestamptz,
               verified boolean, banned boolean, ban_until timestamptz, is_admin boolean,
               clips bigint, trips bigint, reviews bigint, channel_posts bigint)
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
           (select count(*) from public.clips c where c.user_id = p.user_id),
           (select count(*) from public.trips tr where tr.user_id = p.user_id),
           (select count(*) from public.player_ratings r where r.user_id = p.user_id),
           (select count(*) from public.channel_posts cp where cp.author_id = p.user_id)
      from public.profiles p
      join public.teams t on t.id = p.team_id
     where p.user_id = p_user;
end $$;

-- One fan's content of a single kind, newest first (keyset by created_at and a text ref). Same shape and refs as
-- admin_content_feed, so the same remove actions apply. Never anything from a private message.
create function public.admin_user_content(
  p_user uuid, p_kind text, p_limit int default 30, p_before timestamptz default null, p_before_id text default null)
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
       where c.user_id = p_user
         and (p_before is null or c.created_at < p_before
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
       where tr.user_id = p_user
         and (p_before is null or tr.created_at < p_before
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
       where cp.author_id = p_user
         and (p_before is null or cp.created_at < p_before
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
       where r.user_id = p_user
         and (p_before is null or r.updated_at < p_before
              or (p_before_id is not null and r.updated_at = p_before and (r.player_id || ':' || r.user_id::text) < p_before_id))
       order by r.updated_at desc, (r.player_id || ':' || r.user_id::text) desc
       limit v_limit;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
end $$;

revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_user_content(uuid, text, int, timestamptz, text) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_user_content(uuid, text, int, timestamptz, text) to authenticated;
