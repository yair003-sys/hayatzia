-- Same privileges everywhere. The hosted projects do not auto-expose new tables, but a fresh local Supabase grants
-- ALL on every new public table to anon/authenticated by default, which would hide column-level grants.
-- From here on nothing is granted implicitly: each migration grants exactly what it needs.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;

-- Re-grant exactly what the earlier migrations intended.
grant select on public.teams, public.players to anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant update (nick) on public.profiles to authenticated;
grant select on public.api_teams, public.fixtures, public.standings, public.fixture_details to anon, authenticated;
