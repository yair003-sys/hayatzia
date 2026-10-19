-- Phase 3 (algorithm): behavioural personalisation of the feed mix, the privacy-preserving way.
-- We keep NO raw event log and NO content — only a tiny per-fan aggregate of which *kind* of content the fan engages
-- with (image vs video). A trigger on the engagement tables bumps the fan's own counter with a slow time-decay, so the
-- number reflects "what you've been into lately", not a permanent history. The feed reads the fan's own counters (RLS)
-- and tilts the mix a little toward the kind they engage with. Extensible: `dim` lets later phases add other signals
-- (e.g. tags) without a schema change.

create table public.fan_affinity (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dim         text not null,                    -- the signal family, e.g. 'kind'
  key         text not null,                    -- the value within it, e.g. 'image' | 'video'
  score       real not null default 0,          -- decayed engagement weight; always >= 0
  updated_at  timestamptz not null default now(),
  primary key (user_id, dim, key)
);

alter table public.fan_affinity enable row level security;
-- A fan may read only their own affinity; nobody writes it directly (the trigger below, security definer, does).
create policy fan_affinity_own_read on public.fan_affinity for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.fan_affinity from anon, authenticated;
grant select on public.fan_affinity to authenticated;
grant select, insert, update, delete on public.fan_affinity to service_role;

-- Half-life of the decay: content-type taste drifts slowly, so ~14 days (unlike the feed's 8h recency decay).
-- Comments are a stronger signal than a like or a respect.
create function public.bump_kind_affinity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_author uuid;
  v_weight real := case tg_table_name when 'clip_comments' then 2 else 1 end;
begin
  select kind, user_id into v_kind, v_author from public.clips where id = new.clip_id;
  if v_kind is null then
    return null;                                 -- clip gone; nothing to learn
  end if;
  if v_author = new.user_id then
    return null;                                 -- engaging with your own post is not a taste signal
  end if;
  insert into public.fan_affinity as fa (user_id, dim, key, score, updated_at)
    values (new.user_id, 'kind', v_kind, v_weight, now())
  on conflict (user_id, dim, key) do update
    set score = fa.score
                * power(0.5, extract(epoch from (now() - fa.updated_at)) / (14 * 86400))
                + excluded.score,
        updated_at = now();
  return null;
end $$;

revoke all on function public.bump_kind_affinity() from public, anon, authenticated;

create trigger clip_likes_affinity    after insert on public.clip_likes    for each row execute function public.bump_kind_affinity();
create trigger clip_respects_affinity after insert on public.clip_respects for each row execute function public.bump_kind_affinity();
create trigger clip_comments_affinity after insert on public.clip_comments for each row execute function public.bump_kind_affinity();
