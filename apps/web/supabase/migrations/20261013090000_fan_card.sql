-- "הכרטיס שלי" (owner, 2026-10-13): the fan's number in the club = how many of the club's fans joined up to them.
-- One index serves that count (team, join time); it also covers every lookup the old (team) index served.
create index profiles_team_joined_idx on public.profiles (team_id, created_at);
drop index public.profiles_team_idx;
