-- Predictions ("ניחושים", stage 3): a score guess per match of the round, locked at kick-off.
-- 3 points for the exact score, 1 for the right direction (home win / draw / away win). No first-scorer bonus yet
-- (owner, 2026-10-12: our squad cannot be matched reliably to the provider's data until the paid API).
-- Points are written only by the database when a match is finished; a season table per club is kept by trigger.

create table public.predictions (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fixture_id  bigint not null references public.fixtures (id) on delete cascade,
  team_id     text not null default public.my_team() references public.teams (id),  -- stamped
  home_goals  smallint not null check (home_goals between 0 and 20),
  away_goals  smallint not null check (away_goals between 0 and 20),
  points      smallint check (points in (0, 1, 3)),
  exact       boolean,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, fixture_id)
);
create index predictions_fixture_idx on public.predictions (fixture_id);

create table public.prediction_totals (
  team_id  text not null references public.teams (id),
  season   integer not null,
  user_id  uuid not null references auth.users (id) on delete cascade,
  points   integer not null default 0,
  exact    integer not null default 0,
  played   integer not null default 0,
  primary key (team_id, season, user_id)
);
create index prediction_totals_board_idx on public.prediction_totals (team_id, season, points desc, exact desc);

-- Guesses: own club stamped, only before kick-off. Score updates by the database pass (the guess itself is unchanged).
create function public.predictions_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kick timestamptz;
  fan  text;
begin
  if tg_op = 'UPDATE' and new.home_goals = old.home_goals and new.away_goals = old.away_goals then
    return new;
  end if;
  select f.kickoff_at into kick from public.fixtures f where f.id = new.fixture_id;
  if not found then
    raise exception 'no such match' using errcode = '23503';
  end if;
  if now() >= kick then
    raise exception 'locked' using errcode = 'P0001';
  end if;
  select p.team_id into fan from public.profiles p where p.user_id = new.user_id;
  if fan is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.fixture_id := old.fixture_id;
  end if;
  new.team_id := fan;
  new.updated_at := now();
  return new;
end $$;
create trigger predictions_stamp before insert or update on public.predictions
  for each row execute function public.predictions_stamp();

-- Season table: move by the change in points (idempotent re-scoring never double counts).
create function public.predictions_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  yr integer;
begin
  if new.points is not distinct from old.points and new.exact is not distinct from old.exact then
    return null;
  end if;
  select f.season into yr from public.fixtures f where f.id = new.fixture_id;
  insert into public.prediction_totals as t (team_id, season, user_id, points, exact, played)
  values (new.team_id, yr, new.user_id,
          coalesce(new.points, 0) - coalesce(old.points, 0),
          (coalesce(new.exact, false))::int - (coalesce(old.exact, false))::int,
          (new.points is not null)::int - (old.points is not null)::int)
  on conflict (team_id, season, user_id) do update set
    points = t.points + excluded.points,
    exact  = t.exact + excluded.exact,
    played = t.played + excluded.played;
  return null;
end $$;
create trigger predictions_totals after update of points, exact on public.predictions
  for each row execute function public.predictions_totals();

-- Points for every guess of a finished match (full-time score as stored). Safe to run again.
create function public.score_fixture(p_fixture bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  select * into f from public.fixtures where id = p_fixture;
  if not found then
    return;
  end if;
  if f.status not in ('FT', 'AET', 'PEN') or f.home_goals is null or f.away_goals is null then
    update public.predictions set points = null, exact = null where fixture_id = p_fixture and points is not null;
    return;
  end if;
  update public.predictions p set
    exact = (p.home_goals = f.home_goals and p.away_goals = f.away_goals),
    points = case
      when p.home_goals = f.home_goals and p.away_goals = f.away_goals then 3
      when sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals) then 1
      else 0
    end
  where p.fixture_id = p_fixture;
end $$;
revoke all on function public.score_fixture(bigint) from public, anon, authenticated;
grant execute on function public.score_fixture(bigint) to service_role;

create function public.fixtures_score() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.score_fixture(new.id);
  return null;
end $$;
create trigger fixtures_score after update of status, home_goals, away_goals on public.fixtures
  for each row
  when (old.status is distinct from new.status or old.home_goals is distinct from new.home_goals
        or old.away_goals is distinct from new.away_goals)
  execute function public.fixtures_score();

alter table public.predictions enable row level security;
alter table public.prediction_totals enable row level security;
create policy predictions_own_read on public.predictions for select to authenticated using (user_id = (select auth.uid()));
create policy predictions_own_insert on public.predictions for insert to authenticated with check (user_id = (select auth.uid()));
create policy predictions_own_update on public.predictions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prediction_totals_own_club on public.prediction_totals for select to authenticated
  using (team_id = (select public.my_team()));

revoke all on public.predictions, public.prediction_totals from anon, authenticated;
grant select on public.predictions, public.prediction_totals to authenticated;
grant insert (fixture_id, home_goals, away_goals) on public.predictions to authenticated;
grant update (home_goals, away_goals) on public.predictions to authenticated;
grant all on public.predictions, public.prediction_totals to service_role;
