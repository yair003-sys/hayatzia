-- Styled captions on Square clips (owner 2026-10-18): text overlays of several styles, positioned on the clip and
-- rendered on top during playback (no re-encoding, no video-processing cost). Stored as a small JSON array on the clip;
-- the fan sends it, so each caption's text is moderated by a trigger just like the main caption, and the array is capped.

alter table public.clips add column captions jsonb not null default '[]'::jsonb;

create function public.clips_captions_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c jsonb;
begin
  if new.captions is null or jsonb_typeof(new.captions) <> 'array' then
    new.captions := '[]'::jsonb;
    return new;
  end if;
  if jsonb_array_length(new.captions) > 6 then
    raise exception 'too_many_captions' using errcode = '23514';
  end if;
  -- Moderate each caption's text. moderate_text raises on blocked words (check_violation), so a bad caption fails the
  -- whole post, exactly like the main caption.
  for c in select value from jsonb_array_elements(new.captions) loop
    perform public.moderate_text(left(coalesce(c->>'text', ''), 80));
  end loop;
  return new;
end $$;
revoke all on function public.clips_captions_check() from public, anon, authenticated;
-- Named to run after the club/nick stamp and alongside the main-caption moderation.
create trigger zz_captions before insert on public.clips
  for each row execute function public.clips_captions_check();

grant insert (captions) on public.clips to authenticated;  -- column-level: the fan sends the overlays
