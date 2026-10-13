-- "הכרטיס שלי": the club order count is served by an index on (team_id, created_at).
begin;
select plan(2);
select has_index('public', 'profiles', 'profiles_team_joined_idx', array['team_id', 'created_at'], 'fan number count is indexed');
select hasnt_index('public', 'profiles', 'profiles_team_idx', 'the old single-column index is gone');
select * from finish();
rollback;
