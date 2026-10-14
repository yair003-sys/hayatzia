-- Home redesign ("היציע", 2026-10-14). What the new home screen needs from the database:
-- 1. Likes on player reviews (♥): player_rating_likes, one per fan per review, counted by trigger into
--    player_ratings.likes_count. Only reviews with words, of the fan's own club's players, never your own, never when
--    a block exists either way with the author. Editing the words starts the likes over; new stars keep them.
--    home_player_reviews(n): the n most-liked reviews of the last 30 days per player of the caller's club.
-- 2. Story seen-state: no new table. clip_views is already one row per (clip, fan) with viewed_at, readable by the fan
--    for their own rows, so "seen" = a clip_views row of mine (see docs/DATA_MODEL.md).
-- 3. home_active_fans(club): distinct club fans who did something in the last 7 days (indexed sources only).
-- 4. home_fans_of_week(club): top 3 (nick, points), points = prediction points of matches kicked off in the last
--    7 days + 1 per player rated in the last 7 days + likes received from other fans on Square posts of the last
--    7 days. Square posts are deleted after 24 hours, so the likes are tallied per day by trigger (clip_like_days).
-- 5. "Online now" stays Realtime Presence on online:<club> (20261012050000_stand_home): nothing in SQL.
-- Aggregates are security definer, for the caller's own club only (the service role may read any club, for a
-- server-side cache keyed by club). They return counts and nicknames only, never fan ids.

-- ---------- 1. likes on player reviews ----------
alter table public.player_ratings add column likes_count integer not null default 0 check (likes_count >= 0);

-- Stamp (nick, trimmed words, updated_at, own-club check) only when the fan writes stars or words, so a like moving
-- likes_count never refreshes updated_at (the 30-day window is about the words).
drop trigger player_ratings_stamp on public.player_ratings;
create trigger player_ratings_stamp before insert or update of stars, review on public.player_ratings
  for each row execute function public.player_ratings_stamp();

-- Most-liked reviews with words per player (home carousel, last 30 days).
create index player_ratings_top_reviews_idx on public.player_ratings (player_id, likes_count desc, updated_at desc)
  where review <> '';

create table public.player_rating_likes (
  player_id   text not null,
  author_id   uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (player_id, author_id, user_id),
  foreign key (player_id, author_id) references public.player_ratings (player_id, user_id) on delete cascade
);
create index player_rating_likes_user_idx on public.player_rating_likes (user_id, created_at desc);    -- own likes; account delete
create index player_rating_likes_recent_idx on public.player_rating_likes (player_id, created_at desc); -- active fans

create function public.player_rating_likes_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
revoke all on function public.player_rating_likes_stamp() from public, anon, authenticated;
create trigger player_rating_likes_stamp before insert on public.player_rating_likes
  for each row execute function public.player_rating_likes_stamp();

-- Exact counts: +1 / -1 per row (the review row is locked by the update, so concurrent likes queue). When the review
-- itself is being deleted the update finds nothing. While a review's likes are being reset (new words) the review
-- row already says 0, so the per-row decrement is skipped: the reset marks the review in a transaction-local
-- setting. (Not pg_trigger_depth(): a liker's account deletion also deletes likes from inside a trigger, and those
-- must still count down.)
create function public.player_rating_likes_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and current_setting('hayatzia.rating_likes_reset', true) = old.player_id || '/' || old.author_id then
    return null;
  end if;
  if tg_op = 'INSERT' then
    update public.player_ratings set likes_count = likes_count + 1
     where player_id = new.player_id and user_id = new.author_id;
  else
    update public.player_ratings set likes_count = greatest(likes_count - 1, 0)
     where player_id = old.player_id and user_id = old.author_id;
  end if;
  return null;
end $$;
revoke all on function public.player_rating_likes_count() from public, anon, authenticated;
create trigger player_rating_likes_count after insert or delete on public.player_rating_likes
  for each row execute function public.player_rating_likes_count();

-- New words, new likes: the old likes were for the old text (an emptied review cannot keep likes either).
-- The count goes to 0 in the fan's own UPDATE (before trigger; named to sort after player_ratings_stamp, so it sees the trimmed
-- words), then the after trigger deletes the like rows without touching the review row again.
create function public.player_ratings_review_zero() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.review is distinct from old.review then
    new.likes_count := 0;
  end if;
  return new;
end $$;
revoke all on function public.player_ratings_review_zero() from public, anon, authenticated;
create trigger player_ratings_zero_likes_on_new_words before update of review on public.player_ratings
  for each row execute function public.player_ratings_review_zero();

create function public.player_ratings_review_reset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('hayatzia.rating_likes_reset', new.player_id || '/' || new.user_id, true);
  delete from public.player_rating_likes where player_id = new.player_id and author_id = new.user_id;
  perform set_config('hayatzia.rating_likes_reset', '', true);
  return null;
end $$;
revoke all on function public.player_ratings_review_reset() from public, anon, authenticated;
create trigger player_ratings_review_reset after update of review on public.player_ratings
  for each row when (old.review is distinct from new.review) execute function public.player_ratings_review_reset();

alter table public.player_rating_likes enable row level security;
create policy player_rating_likes_read_own on public.player_rating_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy player_rating_likes_insert on public.player_rating_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and author_id <> (select auth.uid())
    and exists (
      select 1 from public.player_ratings r join public.players pl on pl.id = r.player_id
       where r.player_id = player_rating_likes.player_id and r.user_id = player_rating_likes.author_id
         and r.review <> '' and pl.team_id = (select public.my_team()))
    and not public.blocked_between((select auth.uid()), author_id)
  );
create policy player_rating_likes_delete_own on public.player_rating_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.player_rating_likes from anon, authenticated;
grant select, delete on public.player_rating_likes to authenticated;
grant insert (player_id, author_id) on public.player_rating_likes to authenticated;

-- The n (1..20) most-liked reviews with words of the last 30 days, per player of the caller's club, hiding authors
-- with a block either way; liked = the caller's own ♥. Invoker: club scoping and "own likes" come from RLS.
create function public.home_player_reviews(p_per_player integer default 5)
returns table (player_id text, author_id uuid, nick text, review text, stars smallint, likes_count integer,
               liked boolean, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select t.player_id, t.user_id, t.nick::text, t.review::text, t.stars, t.likes_count,
         exists (select 1 from public.player_rating_likes l
                  where l.player_id = t.player_id and l.author_id = t.user_id and l.user_id = (select auth.uid())),
         t.updated_at
    from public.players pl
    cross join lateral (
      select x.player_id, x.user_id, x.nick, x.review, x.stars, x.likes_count, x.updated_at
        from public.player_ratings x
       where x.player_id = pl.id and x.review <> '' and x.updated_at > now() - interval '30 days'
         and not public.blocked_between((select auth.uid()), x.user_id)
       order by x.likes_count desc, x.updated_at desc, x.user_id
       limit least(greatest(coalesce(p_per_player, 5), 1), 20)
    ) t
   where pl.team_id = (select public.my_team())
   order by t.player_id, t.likes_count desc, t.updated_at desc, t.user_id
$$;
revoke all on function public.home_player_reviews(integer) from public, anon;
grant execute on function public.home_player_reviews(integer) to authenticated;

-- ---------- 3 + 4. club aggregates ----------
-- Indexes for the 7-day windows (clips already has (team_id, created_at desc); chat gets a covering one so the
-- distinct-fans scan reads the index only).
create index team_messages_team_active_idx on public.team_messages (team_id, created_at) include (user_id);
create index predictions_team_updated_idx on public.predictions (team_id, updated_at);
create index checkins_team_created_idx on public.checkins (team_id, created_at);
create index fan_lineups_team_updated_idx on public.fan_lineups (team_id, updated_at);
-- "🔥 Hot in the Square today": the most-liked live posts.
create index clips_hot_idx on public.clips (likes_count desc, created_at desc);

-- Likes received per fan per day (the post's day, Israel time) from other fans. Kept by trigger on clip_likes; a post
-- being deleted (24-hour cleanup, owner delete) leaves its likes counted. Internal: read only by home_fans_of_week.
-- Rows older than 14 days are pruned on write.
create table public.clip_like_days (
  team_id  text not null references public.teams (id) on delete cascade,
  day      date not null,
  user_id  uuid not null references auth.users (id) on delete cascade,
  likes    integer not null default 0 check (likes >= 0),
  primary key (team_id, day, user_id)
);
create index clip_like_days_user_idx on public.clip_like_days (user_id);   -- account delete
alter table public.clip_like_days enable row level security;
revoke all on public.clip_like_days from anon, authenticated;

create function public.clip_like_days_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_clip  uuid := case when tg_op = 'INSERT' then new.clip_id else old.clip_id end;
  v_liker uuid := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
  c       record;
  v_day   date;
begin
  select cl.user_id, cl.team_id, cl.created_at into c from public.clips cl where cl.id = v_clip;
  if not found or c.user_id = v_liker then
    return null;   -- the post is being removed (its likes stay counted), or an own like (never counted)
  end if;
  v_day := (c.created_at at time zone 'Asia/Jerusalem')::date;
  if tg_op = 'INSERT' then
    insert into public.clip_like_days as d (team_id, day, user_id, likes) values (c.team_id, v_day, c.user_id, 1)
      on conflict (team_id, day, user_id) do update set likes = d.likes + 1;
    delete from public.clip_like_days d where d.team_id = c.team_id and d.day < v_day - 14;
  else
    update public.clip_like_days d set likes = greatest(d.likes - 1, 0)
     where d.team_id = c.team_id and d.day = v_day and d.user_id = c.user_id;
  end if;
  return null;
end $$;
revoke all on function public.clip_like_days_apply() from public, anon, authenticated;
create trigger clip_likes_week after insert or delete on public.clip_likes
  for each row execute function public.clip_like_days_apply();

-- Fans of p_team with any of these in the last 7 days: a chat message, a Square post, a prediction saved, a player
-- rated, a review liked, a check-in, a fan lineup saved. Each fan counted once.
create function public.home_active_fans(p_team text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - interval '7 days';
  n     integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and (p_team is null or p_team is distinct from public.my_team()) then
    raise exception 'not_your_club' using errcode = '42501';
  end if;
  select count(*)::int into n from (
    select m.user_id from public.team_messages m where m.team_id = p_team and m.created_at > since
    union
    select c.user_id from public.clips c where c.team_id = p_team and c.created_at > since
    union
    select p.user_id from public.predictions p where p.team_id = p_team and p.updated_at > since
    union
    select r.user_id from public.players pl join public.player_ratings r on r.player_id = pl.id
     where pl.team_id = p_team and r.updated_at > since
    union
    select l.user_id from public.players pl join public.player_rating_likes l on l.player_id = pl.id
     where pl.team_id = p_team and l.created_at > since
    union
    select k.user_id from public.checkins k where k.team_id = p_team and k.created_at > since
    union
    select f.user_id from public.fan_lineups f where f.team_id = p_team and f.updated_at > since
  ) a;
  return coalesce(n, 0);
end $$;
revoke all on function public.home_active_fans(text) from public, anon;
grant execute on function public.home_active_fans(text) to authenticated, service_role;

-- Top 3 of p_team this week (nick, points), points > 0. Ties: nick, then an internal order.
create function public.home_fans_of_week(p_team text) returns table (nick text, points integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  since     timestamptz := now() - interval '7 days';
  since_day date := (now() at time zone 'Asia/Jerusalem')::date - 6;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and (p_team is null or p_team is distinct from public.my_team()) then
    raise exception 'not_your_club' using errcode = '42501';
  end if;
  return query
  with pts as (
    select p.user_id, p.points::int as n
      from public.fixtures f join public.predictions p on p.fixture_id = f.id
     where f.kickoff_at > since and f.kickoff_at <= now() and p.team_id = p_team and p.points is not null
    union all
    select r.user_id, 1
      from public.players pl join public.player_ratings r on r.player_id = pl.id
     where pl.team_id = p_team and r.updated_at > since
    union all
    select d.user_id, d.likes from public.clip_like_days d where d.team_id = p_team and d.day >= since_day
  ), total as (
    select x.user_id, sum(x.n)::int as n from pts x group by x.user_id
  )
  select pr.nick::text, t.n
    from total t join public.profiles pr on pr.user_id = t.user_id and pr.team_id = p_team
   where t.n > 0
   order by t.n desc, pr.nick, t.user_id
   limit 3;
end $$;
revoke all on function public.home_fans_of_week(text) from public, anon;
grant execute on function public.home_fans_of_week(text) to authenticated, service_role;
