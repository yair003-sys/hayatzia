-- The staging demo script (service role) creates labelled demo fans and reads squads for demo lineups.
-- Grants only; applied everywhere so the environments stay identical. No data is written by this migration.
grant select, insert on public.profiles to service_role;
grant select on public.teams, public.players to service_role;
