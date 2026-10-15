-- Crowd war ("מלחמת הקהלים", spec docs/superpowers/specs/2026-10-15-crowd-war-design.md). Before every match the two
-- clubs' fans compete: what a fan does in the 48 hours before kick-off adds points to their own club. At kick-off the
-- war freezes. Points per fan per match:
--   a message in the club's team chat or in the match room: 1 each, at most 20;
--   a Square post: 5 each, at most 3 posts;
--   a prediction for the match (created or changed in the window): 5, once;
--   a fan lineup for the match (created or changed in the window): 5, once.
-- Team chat messages and Square posts belong to the club's earliest match inside the window. Only fans of the two
-- clubs count, only for a match not yet started (status NS / TBD). Counters move only by trigger, one upsert per action;
-- a capped counter is not written again. Removing a message, post, guess or lineup keeps the points (they were earned).

-- ---------- tables ----------
create table public.crowd_war_fans (
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  team_id     text not null references public.teams (id),
  chat        smallint not null default 0 check (chat between 0 and 20),
  posts       smallint not null default 0 check (posts between 0 and 3),
  predicted   boolean not null default false,
  lineup      boolean not null default false,
  points      smallint generated always as (
                (chat + 5 * posts + case when predicted then 5 else 0 end + case when lineup then 5 else 0 end)::smallint
              ) stored,
  primary key (fixture_id, user_id)
);
create index crowd_war_fans_user_idx on public.crowd_war_fans (user_id);   -- own rows; account delete

-- Per (match, club): the club's points and how many of its fans scored. Aggregates only, no fan ids.
create table public.crowd_war_totals (
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  team_id     text not null references public.teams (id),
  points      integer not null default 0 check (points >= 0),
  fans        integer not null default 0 check (fans >= 0),
  primary key (fixture_id, team_id)
);
create index crowd_war_totals_team_idx on public.crowd_war_totals (team_id, fixture_id);   -- a club's wars (season record)

-- ---------- scoring ----------
-- The club's earliest match inside the window (kick-off within the next 48 hours, not started). Uses the fixtures
-- (home_api_id, kickoff_at) and (away_api_id, kickoff_at) indexes.
create function private.crowd_war_next_fixture(p_team text) returns bigint
language sql stable set search_path = '' as $$
  select x.id from (
    select f.id, f.kickoff_at
      from public.teams t join public.api_teams a on a.name = any (t.api_names)
      join public.fixtures f on f.home_api_id = a.api_id
     where t.id = p_team and f.kickoff_at > now() and f.kickoff_at <= now() + interval '48 hours'
       and f.status in ('NS', 'TBD')
    union all
    select f.id, f.kickoff_at
      from public.teams t join public.api_teams a on a.name = any (t.api_names)
      join public.fixtures f on f.away_api_id = a.api_id
     where t.id = p_team and f.kickoff_at > now() and f.kickoff_at <= now() + interval '48 hours'
       and f.status in ('NS', 'TBD')
  ) x
  order by x.kickoff_at, x.id
  limit 1
$$;
revoke all on function private.crowd_war_next_fixture(text) from public, anon, authenticated;

-- One action of a fan for a match: checks the window and that the fan's club plays, then one upsert. A counter at its
-- cap (or a prediction / lineup already counted) is not written again.
create function private.crowd_war_score(p_fixture bigint, p_user uuid, p_team text, p_kind text) returns void
language plpgsql set search_path = '' as $$
declare
  f record;
begin
  if p_fixture is null or p_user is null or p_team is null then
    return;
  end if;
  select fx.kickoff_at, fx.status, public.club_of_api(fx.home_api_id) as home, public.club_of_api(fx.away_api_id) as away
    into f from public.fixtures fx where fx.id = p_fixture;
  if not found
     or now() >= f.kickoff_at or now() < f.kickoff_at - interval '48 hours'
     or f.status not in ('NS', 'TBD')
     or (p_team is distinct from f.home and p_team is distinct from f.away) then
    return;
  end if;
  insert into public.crowd_war_fans as w (fixture_id, user_id, team_id, chat, posts, predicted, lineup)
  values (p_fixture, p_user, p_team,
          case when p_kind = 'chat' then 1 else 0 end,
          case when p_kind = 'post' then 1 else 0 end,
          p_kind = 'prediction',
          p_kind = 'lineup')
  on conflict (fixture_id, user_id) do update set
    chat      = w.chat + case when p_kind = 'chat' then 1 else 0 end,
    posts     = w.posts + case when p_kind = 'post' then 1 else 0 end,
    predicted = w.predicted or p_kind = 'prediction',
    lineup    = w.lineup or p_kind = 'lineup'
  where (p_kind = 'chat' and w.chat < 20)
     or (p_kind = 'post' and w.posts < 3)
     or (p_kind = 'prediction' and not w.predicted)
     or (p_kind = 'lineup' and not w.lineup);
end $$;
revoke all on function private.crowd_war_score(bigint, uuid, text, text) from public, anon, authenticated;

-- One trigger function for the five sources (after insert; predictions and lineups also after a real change).
create function public.crowd_war_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'team_messages' then
    perform private.crowd_war_score(private.crowd_war_next_fixture(new.team_id), new.user_id, new.team_id, 'chat');
  elsif tg_table_name = 'clips' then
    perform private.crowd_war_score(private.crowd_war_next_fixture(new.team_id), new.user_id, new.team_id, 'post');
  elsif tg_table_name = 'match_messages' then
    perform private.crowd_war_score(new.fixture_id, new.user_id, new.team_id, 'chat');
  elsif tg_table_name = 'predictions' then
    if tg_op = 'UPDATE' and new.home_goals = old.home_goals and new.away_goals = old.away_goals then
      return null;   -- the database scoring the guess after the match, not the fan changing it
    end if;
    perform private.crowd_war_score(new.fixture_id, new.user_id, new.team_id, 'prediction');
  elsif tg_table_name = 'fan_lineups' then
    if tg_op = 'UPDATE' and new.formation = old.formation and new.slots = old.slots then
      return null;
    end if;
    perform private.crowd_war_score(new.fixture_id, new.user_id, new.team_id, 'lineup');
  end if;
  return null;
end $$;
revoke all on function public.crowd_war_track() from public, anon, authenticated;

create trigger crowd_war after insert on public.team_messages for each row execute function public.crowd_war_track();
create trigger crowd_war after insert on public.match_messages for each row execute function public.crowd_war_track();
create trigger crowd_war after insert on public.clips for each row execute function public.crowd_war_track();
create trigger crowd_war after insert or update of home_goals, away_goals on public.predictions
  for each row execute function public.crowd_war_track();
create trigger crowd_war after insert or update of formation, slots on public.fan_lineups
  for each row execute function public.crowd_war_track();

-- Club totals follow the fan rows by the change in points. A fan row removed (account deleted) counts down only
-- before kick-off: at kick-off the result is final.
create function public.crowd_war_totals_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fixture bigint := case when tg_op = 'DELETE' then old.fixture_id else new.fixture_id end;
  v_team    text   := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  d_points  integer := coalesce(case when tg_op = 'DELETE' then null else new.points end, 0)
                       - coalesce(case when tg_op = 'INSERT' then null else old.points end, 0);
  d_fans    integer := case tg_op when 'INSERT' then 1 when 'DELETE' then -1 else 0 end;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.fixtures f where f.id = v_fixture and f.kickoff_at > now()) then
      return null;   -- the match is being deleted (its totals go with it), or the war is final
    end if;
    update public.crowd_war_totals t set
      points = greatest(t.points + d_points, 0),
      fans   = greatest(t.fans + d_fans, 0)
    where t.fixture_id = v_fixture and t.team_id = v_team;
    return null;
  end if;
  if d_points = 0 and d_fans = 0 then
    return null;
  end if;
  insert into public.crowd_war_totals as t (fixture_id, team_id, points, fans)
  values (v_fixture, v_team, greatest(d_points, 0), greatest(d_fans, 0))
  on conflict (fixture_id, team_id) do update set
    points = greatest(t.points + d_points, 0),
    fans   = greatest(t.fans + d_fans, 0);
  return null;
end $$;
revoke all on function public.crowd_war_totals_apply() from public, anon, authenticated;
create trigger crowd_war_totals after insert or update or delete on public.crowd_war_fans
  for each row execute function public.crowd_war_totals_apply();

-- ---------- season record ----------
-- A club's finished wars in a season: wins, losses, draws (equal points, both above zero). A war where neither crowd
-- scored does not count; a war where only one crowd scored is that crowd's win. Reads the club's fixtures through the
-- (home/away, kickoff) indexes and the totals by primary key. Invoker: totals and fixtures are readable by fans.
create function public.crowd_war_record(p_team text, p_season integer)
returns table (wins integer, losses integer, draws integer)
language sql stable security invoker set search_path = '' as $$
  with ids as (
    select a.api_id from public.teams t join public.api_teams a on a.name = any (t.api_names) where t.id = p_team
  ), fx as (
    select f.id from public.fixtures f
     where f.home_api_id in (select i.api_id from ids i) and f.season = p_season and f.kickoff_at <= now()
    union
    select f.id from public.fixtures f
     where f.away_api_id in (select i.api_id from ids i) and f.season = p_season and f.kickoff_at <= now()
  ), w as (
    select coalesce(sum(t.points) filter (where t.team_id = p_team), 0) as mine,
           coalesce(sum(t.points) filter (where t.team_id <> p_team), 0) as theirs
      from fx join public.crowd_war_totals t on t.fixture_id = fx.id
     group by fx.id
  )
  select (count(*) filter (where w.mine > w.theirs))::int,
         (count(*) filter (where w.mine < w.theirs))::int,
         (count(*) filter (where w.mine = w.theirs and w.mine > 0))::int
    from w
$$;
revoke all on function public.crowd_war_record(text, integer) from public, anon;
grant execute on function public.crowd_war_record(text, integer) to authenticated, service_role;

-- ---------- row level security ----------
alter table public.crowd_war_fans   enable row level security;
alter table public.crowd_war_totals enable row level security;

-- A fan reads only their own row ("תרמת N נקודות").
create policy crowd_war_fans_read_own on public.crowd_war_fans for select to authenticated
  using (user_id = (select auth.uid()));
-- Aggregates only: any signed-in fan.
create policy crowd_war_totals_read on public.crowd_war_totals for select to authenticated using (true);

revoke all on public.crowd_war_fans, public.crowd_war_totals from anon, authenticated;
grant select on public.crowd_war_fans, public.crowd_war_totals to authenticated;
grant select on public.crowd_war_fans, public.crowd_war_totals to service_role;
