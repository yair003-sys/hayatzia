-- Open fan profiles across clubs (owner 2026-11-02). Fans asked to view the profiles of fans from other clubs — this is
-- consistent with league DMs, which already cross clubs. The column-level SELECT grant already limits reads to safe
-- public fields (user_id, nick, team_id, created_at, terms_version, clips_posted, avatar_path, cover_path), so this only
-- widens which rows are visible, never which columns: sensitive columns (birth_date, qr_code, dm_requests, …) stay
-- ungranted and unreadable.
drop policy profiles_read_own_and_team on public.profiles;
create policy profiles_read_all on public.profiles for select to authenticated using (true);
