-- The Square gets a club tab (owner, 2026-10-12): a post goes to the whole league ('all', default) or only to the
-- poster's club ('team'). Both disappear after 24 hours. Team posts replace "תמונות מהיציע" (the team_photos table
-- stays for now; nothing writes to it any more).

alter table public.clips add column audience text not null default 'all' check (audience in ('all', 'team'));
create index clips_team_audience_feed_idx on public.clips (team_id, audience, created_at desc, id desc);
create index clips_audience_feed_idx on public.clips (audience, created_at desc, id desc);

-- Visible while alive, to everyone for league posts and to the club for team posts; view-once as before.
drop policy clips_read on public.clips;
create policy clips_read on public.clips for select to authenticated using (
  expires_at > now()
  and (audience = 'all' or team_id = (select public.my_team()))
  and (not once or user_id = (select auth.uid()) or not public.clip_seen(id))
);

grant insert (audience) on public.clips to authenticated;
