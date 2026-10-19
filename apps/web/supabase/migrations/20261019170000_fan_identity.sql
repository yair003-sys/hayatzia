-- Fan identity (algorithm phase 2): a lifetime "posts" counter on the fan's profile, so the "creator" label survives
-- the 24h clip expiry (live clips alone would undercount a prolific creator). Counter-by-trigger, per project standard.

alter table public.profiles add column clips_posted integer not null default 0;
-- profiles SELECT is column-scoped (ride_safety migration); the fan reads their own post count on their card.
grant select (clips_posted) on public.profiles to authenticated;

create function public.clips_bump_poster() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set clips_posted = clips_posted + 1 where user_id = new.user_id;
  return new;
end $$;

-- Trigger-only function: no one calls it directly (the trigger fires it regardless of EXECUTE grants), so close it to
-- every caller. Supabase's default privileges grant EXECUTE on new functions to anon/authenticated too, so revoke all.
revoke all on function public.clips_bump_poster() from public, anon, authenticated;
create trigger clips_bump_poster after insert on public.clips for each row execute function public.clips_bump_poster();
