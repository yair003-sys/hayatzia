-- Following across clubs (owner 2026-11-14): a fan can view ANY fan's full card — their own club or a rival's — and
-- follow them. Engagement is the goal. Two pieces live here:
--   1. a `follows` social graph (follower → followee), with per-profile counters kept by trigger;
--   2. `fan_card`, a SECURITY DEFINER function that returns one fan's public card (profile fields + play stats +
--      follow counters + whether the caller follows them) regardless of club. Only these aggregate, public fields are
--      exposed — never a row of a club-scoped table — so opening the card across clubs leaks nothing else.
-- NOTE: this migration runs AFTER the 2026-10-15 hardening blanket-revoke, so NEW functions here keep their default
-- PUBLIC execute unless we revoke it. We revoke on every function below and grant back only `fan_card`, to authenticated
-- (same rule the security.test enforces: logged-out visitors run only the public club lookup).

-- ---------- counters on the profile ----------
alter table public.profiles
  add column followers_count integer not null default 0,
  add column following_count integer not null default 0;

-- ---------- the social graph ----------
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  followee_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
-- "who follows X" and the following-feed both scan by followee; the PK already serves "who X follows".
create index follows_followee_idx on public.follows (followee_id, created_at desc);

alter table public.follows enable row level security;
-- A fan sees only edges that touch them (who they follow, who follows them); the public counts come through fan_card.
create policy follows_read   on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));
grant select, insert, delete on public.follows to authenticated;

-- Counters by trigger (never trust a client count). Runs as definer to touch the two profile rows.
create function public.follows_counter() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where user_id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where user_id = new.follower_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where user_id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where user_id = old.follower_id;
    return old;
  end if;
  return null;
end;
$$;
revoke all on function public.follows_counter() from public, anon, authenticated;
create trigger follows_count after insert or delete on public.follows
  for each row execute function public.follows_counter();

-- ---------- the public card, any club ----------
-- Returns at most one row: the fan's public card. Play stats mirror getFanCard. `i_follow` is from the CALLER's side
-- (auth.uid() is the caller's id even inside a definer function). Season-less callers pass null → stats default to 0.
create function public.fan_card(p_user uuid, p_season integer default null)
returns table (
  nick text, team_id text, avatar_path text, cover_path text, created_at timestamptz, clips_posted integer,
  join_number integer, games integer, away integer, points integer, exact integer, rank integer, rated integer,
  followers_count integer, following_count integer, i_follow boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.user_id, p.nick, p.team_id, p.avatar_path, p.cover_path, p.created_at, p.clips_posted,
           p.followers_count, p.following_count
    from public.profiles p where p.user_id = p_user
  ),
  tot as (
    select t.points, t.exact from public.prediction_totals t, me
    where t.user_id = me.user_id and t.team_id = me.team_id and t.season = p_season
  )
  select
    me.nick,
    me.team_id,
    me.avatar_path,
    me.cover_path,
    me.created_at,
    me.clips_posted,
    (select count(*)::int from public.profiles p2 where p2.team_id = me.team_id and p2.created_at <= me.created_at) as join_number,
    (select count(*)::int from public.checkins c join public.fixtures f on f.id = c.fixture_id
       where c.user_id = me.user_id and (p_season is null or f.season = p_season)) as games,
    (select count(*)::int from public.checkins c join public.fixtures f on f.id = c.fixture_id
       where c.user_id = me.user_id and c.away and (p_season is null or f.season = p_season)) as away,
    coalesce((select points from tot), 0) as points,
    coalesce((select exact from tot), 0) as exact,
    case when exists (select 1 from tot)
      then (select count(*)::int from public.prediction_totals t2, me
              where t2.team_id = me.team_id and t2.season = p_season and t2.points > (select points from tot)) + 1
      else null end as rank,
    (select count(distinct c.fixture_id)::int from public.match_ratings c where c.user_id = me.user_id) as rated,
    me.followers_count,
    me.following_count,
    exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = me.user_id) as i_follow
  from me;
$$;
revoke all on function public.fan_card(uuid, integer) from public, anon, authenticated;
grant execute on function public.fan_card(uuid, integer) to authenticated;
