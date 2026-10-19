-- The Square gets a "both feeds" option (owner, 2026-10-19): a post can go to the whole league ('all'), only the
-- poster's club ('team'), or BOTH ('both' — it shows in the league feed and in the club's own feed). Same 24h life.

-- Widen the audience check to allow 'both' (drop the existing check by whatever name it was auto-given).
do $$
declare cn text;
begin
  select conname into cn from pg_constraint
   where conrelid = 'public.clips'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%audience%';
  if cn is not null then execute format('alter table public.clips drop constraint %I', cn); end if;
end $$;
alter table public.clips add constraint clips_audience_check check (audience in ('all', 'team', 'both'));

-- 'both' posts are public like 'all' (they appear in the league feed); 'team' stays club-only. The club feed scopes
-- 'both' posts to the viewer's own club in the query, so other clubs' 'both' posts don't appear in a club's tab.
drop policy clips_read on public.clips;
create policy clips_read on public.clips for select to authenticated using (
  expires_at > now()
  and (audience in ('all', 'both') or team_id = (select public.my_team()))
  and (not once or user_id = (select auth.uid()) or not public.clip_seen(id))
);
