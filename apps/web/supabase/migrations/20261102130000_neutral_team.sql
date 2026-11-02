-- Neutral staff affiliation (owner, 2026-11-02): an operator must not be shown as, counted as, or visible to any real
-- club. Every account references a team (profiles.team_id), so we add one neutral team, 'onefan', for operators.
-- It has no api_names, so it never matches a fixture or a live game; it is deliberately absent from the app's TEAMS
-- constant, so it never appears in the sign-up club picker or any fan-facing club list. A fan on this team sees an empty
-- neutral stand and no real fan sees them. Colours mirror NEUTRAL_TEAM in src/features/teams/data.ts.
-- id must be exactly three lowercase letters (teams_id_check), so the id is 'onf'; the display name is 'onefan'.
insert into public.teams (id, name, short, color_bg, color_ring, color_bar, api_names, sort) values
  ('onf', 'onefan', 'onefan', '#6B7280', '#F3F4F6', '#9AA5B2', array[]::text[], 99)
on conflict (id) do update
  set name = excluded.name, short = excluded.short, color_bg = excluded.color_bg,
      color_ring = excluded.color_ring, color_bar = excluded.color_bar, api_names = excluded.api_names, sort = excluded.sort;
