-- Fan identity (algorithm phase 2): a lifetime "posts" counter on the fan's profile, so the "creator" label survives
-- the 24h clip expiry (live clips alone would undercount a prolific creator). Counter-by-trigger, per project standard.

alter table public.profiles add column clips_posted integer not null default 0;

create function public.clips_bump_poster() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set clips_posted = clips_posted + 1 where user_id = new.user_id;
  return new;
end $$;

create trigger clips_bump_poster after insert on public.clips for each row execute function public.clips_bump_poster();
