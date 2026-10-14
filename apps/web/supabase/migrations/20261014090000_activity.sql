-- Activity bell ("התראות"): what happened to the fan's own things. Likes on their Square clips and stand photos
-- (one row per post, aggregated), requests to join their trip (one row per requester), and their own request being
-- accepted. Rows are written only by the triggers below (never by clients), counted by trigger (never at read time),
-- broadcast ids-only on the fan's private 'inbox:<fan>' topic (event 'activity'), and kept 60 days (pruned on write:
-- there is no scheduled database job).

create table public.activity (
  id            bigserial primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,             -- the recipient
  kind          text not null check (kind in ('clip_like', 'photo_like', 'trip_request', 'trip_accepted')),
  clip_id       uuid references public.clips (id) on delete cascade,
  photo_id      uuid references public.team_photos (id) on delete cascade,
  trip_id       uuid references public.trips (id) on delete cascade,
  -- Join requests only: who asked. Part of the row's identity, never null for a request, and its row goes with the
  -- requester's account (actor_id below may be nulled, so identity must not depend on it).
  requester_id  uuid references auth.users (id) on delete cascade,
  -- The latest actor. Set null when that account is deleted (an aggregated like row must not vanish with one liker);
  -- the like triggers then show another remaining liker.
  actor_id      uuid references auth.users (id) on delete set null,
  actor_count   integer not null default 1 check (actor_count >= 1),
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default clock_timestamp(),
  -- The post or trip: together with user_id, kind and requester_id, the row's identity.
  subject       uuid generated always as (coalesce(clip_id, photo_id, trip_id)) stored,
  check (
    (kind = 'clip_like' and clip_id is not null and photo_id is null and trip_id is null)
    or (kind = 'photo_like' and photo_id is not null and clip_id is null and trip_id is null)
    or (kind in ('trip_request', 'trip_accepted') and trip_id is not null and clip_id is null and photo_id is null)
  ),
  check ((kind = 'trip_request') = (requester_id is not null))
);
create unique index activity_identity_uq on public.activity (user_id, kind, subject, requester_id) nulls not distinct;
create index activity_feed_idx on public.activity (user_id, updated_at desc, id desc);   -- list (keyset), badge, prune
-- Foreign keys: deleting a post, trip or account finds its rows by index.
create index activity_clip_idx on public.activity (clip_id) where clip_id is not null;
create index activity_photo_idx on public.activity (photo_id) where photo_id is not null;
create index activity_trip_idx on public.activity (trip_id) where trip_id is not null;
create index activity_requester_idx on public.activity (requester_id) where requester_id is not null;
create index activity_actor_idx on public.activity (actor_id) where actor_id is not null;

create table public.activity_seen (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  seen_at  timestamptz not null default clock_timestamp()
);

-- ---------- row level security: own rows, read only ----------
alter table public.activity      enable row level security;
alter table public.activity_seen enable row level security;
create policy activity_own_read on public.activity for select to authenticated using (user_id = (select auth.uid()));
create policy activity_seen_own_read on public.activity_seen for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.activity, public.activity_seen from anon, authenticated;
revoke all on sequence public.activity_id_seq from anon, authenticated;
grant select on public.activity, public.activity_seen to authenticated;

-- ---------- writers (called only by the triggers) ----------
-- Tell the fan's open tabs that their list changed (kind only; the client re-reads).
create function public.activity_broadcast(p_user uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', p_kind), 'activity', 'inbox:' || p_user, true);
end $$;
revoke all on function public.activity_broadcast(uuid, text) from public, anon, authenticated;

-- The recipient's rows older than 60 days go first (an index range on activity_feed_idx).
create function public.activity_prune(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.activity where user_id = p_user and updated_at < clock_timestamp() - interval '60 days'
$$;
revoke all on function public.activity_prune(uuid) from public, anon, authenticated;

-- Exact number of counted likes on p_user's post: the post's trigger-kept likes_count, minus the owner's own like,
-- minus likes from fans blocked either way (driven by the owner's blocks, each checked by the likes primary key).
-- Cheap, so it holds for posts liked before this migration too. The like triggers below are named *_notify so they
-- fire after the *_count triggers (same timing: alphabetical order) and see the new likes_count.
create function public.activity_like_total(p_user uuid, p_kind text, p_subject uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  total integer;
begin
  if p_kind = 'clip_like' then
    select c.likes_count into total from public.clips c where c.id = p_subject;
    total := total
      - (select count(*)::int from public.clip_likes l where l.clip_id = p_subject and l.user_id = p_user)
      - (select count(*)::int from (
           select k.blocked_id as u from public.blocks k where k.user_id = p_user
           union
           select k.user_id from public.blocks k where k.blocked_id = p_user
         ) b where exists (select 1 from public.clip_likes l where l.clip_id = p_subject and l.user_id = b.u));
  else
    select t.likes_count into total from public.team_photos t where t.id = p_subject;
    total := total
      - (select count(*)::int from public.team_photo_likes l where l.photo_id = p_subject and l.user_id = p_user)
      - (select count(*)::int from (
           select k.blocked_id as u from public.blocks k where k.user_id = p_user
           union
           select k.user_id from public.blocks k where k.blocked_id = p_user
         ) b where exists (select 1 from public.team_photo_likes l where l.photo_id = p_subject and l.user_id = b.u));
  end if;
  return greatest(coalesce(total, 0), 0);
end $$;
revoke all on function public.activity_like_total(uuid, text, uuid) from public, anon, authenticated;

-- A like on p_user's post: the row shows the liker and the exact count, and moves to the top. Own likes and fans
-- blocked either way are skipped.
create function public.activity_like(p_user uuid, p_kind text, p_subject uuid, p_liker uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if p_user is null or p_liker is null or p_user = p_liker or public.blocked_between(p_user, p_liker) then
    return;
  end if;
  n := public.activity_like_total(p_user, p_kind, p_subject);
  if n <= 0 then
    return;
  end if;
  perform public.activity_prune(p_user);
  insert into public.activity (user_id, kind, clip_id, photo_id, actor_id, actor_count)
  values (p_user, p_kind,
          case when p_kind = 'clip_like' then p_subject end,
          case when p_kind = 'photo_like' then p_subject end,
          p_liker, n)
  on conflict (user_id, kind, subject, requester_id) do update
    set actor_id = excluded.actor_id, actor_count = excluded.actor_count, updated_at = clock_timestamp();
  perform public.activity_broadcast(p_user, p_kind);
end $$;
revoke all on function public.activity_like(uuid, text, uuid, uuid) from public, anon, authenticated;

-- An unlike (or a liker's account going): the exact count again. None left → the row is removed. When the shown
-- liker is the one who left (or their account is gone), another remaining liker is looked up through the likes
-- primary key (clip_id/photo_id, user_id). updated_at is kept: an unlike never lights the badge.
create function public.activity_unlike(p_user uuid, p_kind text, p_subject uuid, p_liker uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.activity;
  n integer;
  other uuid;
begin
  if p_user is null or p_user = p_liker then
    return;
  end if;
  select * into a from public.activity
  where user_id = p_user and kind = p_kind and subject = p_subject and requester_id is null
  for update;
  if not found then
    return;
  end if;
  n := public.activity_like_total(p_user, p_kind, p_subject);
  other := a.actor_id;
  if n > 0 and (a.actor_id is null or a.actor_id = p_liker) then
    if p_kind = 'clip_like' then
      select l.user_id into other from public.clip_likes l
      where l.clip_id = p_subject and l.user_id <> p_user and l.user_id <> p_liker
        and not public.blocked_between(p_user, l.user_id)
      limit 1;
    else
      select l.user_id into other from public.team_photo_likes l
      where l.photo_id = p_subject and l.user_id <> p_user and l.user_id <> p_liker
        and not public.blocked_between(p_user, l.user_id)
      limit 1;
    end if;
  end if;
  if n <= 0 or other is null then
    delete from public.activity where id = a.id;
  else
    update public.activity set actor_id = other, actor_count = n where id = a.id;
  end if;
  perform public.activity_broadcast(p_user, p_kind);
end $$;
revoke all on function public.activity_unlike(uuid, text, uuid, uuid) from public, anon, authenticated;

-- A trip row: a request for the driver (one per requester) or an acceptance for the rider. Own actions and fans
-- blocked either way are skipped. Repeating it only moves the row to the top.
create function public.activity_trip_put(p_user uuid, p_kind text, p_trip uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_actor is null or p_user = p_actor or public.blocked_between(p_user, p_actor) then
    return;
  end if;
  perform public.activity_prune(p_user);
  insert into public.activity (user_id, kind, trip_id, requester_id, actor_id)
  values (p_user, p_kind, p_trip, case when p_kind = 'trip_request' then p_actor end, p_actor)
  on conflict (user_id, kind, subject, requester_id) do update
    set actor_id = excluded.actor_id, actor_count = 1, updated_at = clock_timestamp();
  perform public.activity_broadcast(p_user, p_kind);
end $$;
revoke all on function public.activity_trip_put(uuid, text, uuid, uuid) from public, anon, authenticated;

-- Remove a trip row (withdrawn request, acceptance taken back). p_requester: the requester for 'trip_request', null
-- for 'trip_accepted'.
create function public.activity_trip_drop(p_user uuid, p_kind text, p_trip uuid, p_requester uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.activity
  where user_id = p_user and kind = p_kind and subject = p_trip and requester_id is not distinct from p_requester;
  if found then
    perform public.activity_broadcast(p_user, p_kind);
  end if;
end $$;
revoke all on function public.activity_trip_drop(uuid, text, uuid, uuid) from public, anon, authenticated;

-- ---------- triggers ----------
-- When a post is deleted its likes cascade after it: the post is already gone, so nothing is done (its rows go by
-- the activity foreign key).
create function public.activity_clip_likes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select c.user_id into v_owner from public.clips c where c.id = new.clip_id;
    perform public.activity_like(v_owner, 'clip_like', new.clip_id, new.user_id);
  else
    select c.user_id into v_owner from public.clips c where c.id = old.clip_id;
    perform public.activity_unlike(v_owner, 'clip_like', old.clip_id, old.user_id);
  end if;
  return null;
end $$;
revoke all on function public.activity_clip_likes() from public, anon, authenticated;
-- Must sort after clip_likes_count (see activity_like_total).
create trigger clip_likes_notify after insert or delete on public.clip_likes
  for each row execute function public.activity_clip_likes();

create function public.activity_photo_likes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select t.user_id into v_owner from public.team_photos t where t.id = new.photo_id;
    perform public.activity_like(v_owner, 'photo_like', new.photo_id, new.user_id);
  else
    select t.user_id into v_owner from public.team_photos t where t.id = old.photo_id;
    perform public.activity_unlike(v_owner, 'photo_like', old.photo_id, old.user_id);
  end if;
  return null;
end $$;
revoke all on function public.activity_photo_likes() from public, anon, authenticated;
-- Must sort after team_photo_likes_count (see activity_like_total).
create trigger team_photo_likes_notify after insert or delete on public.team_photo_likes
  for each row execute function public.activity_photo_likes();

-- A request (always pending on insert) → a row for the driver. Accepted → a row for the rider from the driver;
-- declined → nothing; an acceptance taken back, or a withdrawn request, removes what it made. A requester's account
-- going removes their request row by the requester_id foreign key, whichever cascade runs first.
create function public.activity_trip_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select t.user_id into v_owner from public.trips t where t.id = new.trip_id;
    perform public.activity_trip_put(v_owner, 'trip_request', new.trip_id, new.user_id);
  elsif tg_op = 'UPDATE' then
    select t.user_id into v_owner from public.trips t where t.id = new.trip_id;
    if new.status = 'accepted' and old.status <> 'accepted' then
      perform public.activity_trip_put(new.user_id, 'trip_accepted', new.trip_id, v_owner);
    elsif old.status = 'accepted' and new.status <> 'accepted' then
      perform public.activity_trip_drop(new.user_id, 'trip_accepted', new.trip_id, null);
    end if;
  else
    select t.user_id into v_owner from public.trips t where t.id = old.trip_id;
    if found then
      perform public.activity_trip_drop(v_owner, 'trip_request', old.trip_id, old.user_id);
      perform public.activity_trip_drop(old.user_id, 'trip_accepted', old.trip_id, null);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.activity_trip_requests() from public, anon, authenticated;
create trigger trip_requests_activity after insert or delete on public.trip_requests
  for each row execute function public.activity_trip_requests();
create trigger trip_requests_status_activity after update of status on public.trip_requests
  for each row when (old.status is distinct from new.status) execute function public.activity_trip_requests();

-- ---------- badge ----------
-- Rows changed since the fan last opened the list (and within 60 days), up to 100 (the UI shows 100 as "99+").
-- volatile: it reads clock_timestamp().
create function public.activity_unread_count() returns integer
language sql volatile security definer set search_path = '' as $$
  select count(*)::int from (
    select 1 from public.activity a
    where a.user_id = auth.uid()
      and a.updated_at > greatest(
        coalesce((select s.seen_at from public.activity_seen s where s.user_id = auth.uid()), '-infinity'),
        clock_timestamp() - interval '60 days')
    limit 100
  ) x
$$;
revoke all on function public.activity_unread_count() from public, anon, authenticated;
grant execute on function public.activity_unread_count() to authenticated;

create function public.mark_activity_seen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.activity_seen (user_id, seen_at) values (auth.uid(), clock_timestamp())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
end $$;
revoke all on function public.mark_activity_seen() from public, anon, authenticated;
grant execute on function public.mark_activity_seen() to authenticated;
