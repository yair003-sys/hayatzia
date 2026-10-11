-- League data copied from the legacy API-Football pipeline (data/*.json) by scripts/ingest-league.ts.
-- Public read-only reference data: anyone may read, only the ingest (service_role / secret key) writes.

create table if not exists public.api_teams (
  api_id      integer primary key,
  name        text not null,
  logo        text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.fixtures (
  id           bigint primary key,            -- API-Football fixture id
  league_id    integer not null,
  season       integer not null,
  round        text not null,
  kickoff_at   timestamptz not null,
  status       text not null,
  elapsed      smallint,
  home_api_id  integer not null references public.api_teams (api_id),
  away_api_id  integer not null references public.api_teams (api_id),
  home_goals   smallint,
  away_goals   smallint,
  venue        text not null default '',
  updated_at   timestamptz not null default now()
);
create index if not exists fixtures_season_kickoff_idx on public.fixtures (season, kickoff_at);
create index if not exists fixtures_home_kickoff_idx on public.fixtures (home_api_id, kickoff_at);
create index if not exists fixtures_away_kickoff_idx on public.fixtures (away_api_id, kickoff_at);

create table if not exists public.standings (
  season       integer not null,
  group_name   text not null,
  group_order  smallint not null,             -- order of the group as published (championship, relegation, regular season)
  api_team_id  integer not null references public.api_teams (api_id),
  rank         smallint not null,
  points       smallint not null,
  played       smallint not null,
  won          smallint not null,
  drawn        smallint not null,
  lost         smallint not null,
  gf           smallint not null,
  ga           smallint not null,
  gd           smallint not null,
  form         text not null default '',
  description  text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (season, group_name, api_team_id)
);
create index if not exists standings_season_order_idx on public.standings (season, group_order, rank);

create table if not exists public.fixture_details (
  fixture_id  bigint primary key references public.fixtures (id) on delete cascade,
  events      jsonb not null default '[]'::jsonb,
  lineups     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.api_teams       enable row level security;
alter table public.fixtures        enable row level security;
alter table public.standings       enable row level security;
alter table public.fixture_details enable row level security;

drop policy if exists api_teams_read on public.api_teams;
create policy api_teams_read on public.api_teams for select to anon, authenticated using (true);
drop policy if exists fixtures_read on public.fixtures;
create policy fixtures_read on public.fixtures for select to anon, authenticated using (true);
drop policy if exists standings_read on public.standings;
create policy standings_read on public.standings for select to anon, authenticated using (true);
drop policy if exists fixture_details_read on public.fixture_details;
create policy fixture_details_read on public.fixture_details for select to anon, authenticated using (true);

-- New tables are not exposed automatically in these projects: grant explicitly.
grant select on public.api_teams, public.fixtures, public.standings, public.fixture_details to anon, authenticated;
grant select, insert, update, delete on public.api_teams, public.fixtures, public.standings, public.fixture_details to service_role;
