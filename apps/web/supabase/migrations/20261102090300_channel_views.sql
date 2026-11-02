-- Unique per-fan view counter for channel posts (2026-11-01). One row per (post, fan); a second view by the same fan
-- is a no-op (PK). The post's views_count is incremented once per fan by trigger (insert-only), mirroring clip_views.

create table public.channel_post_views (
  post_id   uuid not null references public.channel_posts (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index channel_post_views_user_idx on public.channel_post_views (user_id, post_id);

-- Stamp the viewer; refuse a view on another club's post.
create function public.channel_post_views_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  new.user_id := (select auth.uid());
  select t.team_id into p from public.channel_posts t where t.id = new.post_id;
  if not found then
    raise exception 'no_post' using errcode = '23503';
  end if;
  if p.team_id <> (select public.my_team()) then
    raise exception 'not_your_club' using errcode = '42501';
  end if;
  new.viewed_at := now();
  return new;
end $$;
revoke all on function public.channel_post_views_stamp() from public, anon, authenticated;
create trigger channel_post_views_stamp before insert on public.channel_post_views
  for each row execute function public.channel_post_views_stamp();

create function public.channel_post_views_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.channel_posts set views_count = views_count + 1 where id = new.post_id;
  return null;
end $$;
revoke all on function public.channel_post_views_count() from public, anon, authenticated;
create trigger channel_post_views_count after insert on public.channel_post_views
  for each row execute function public.channel_post_views_count();

alter table public.channel_post_views enable row level security;
create policy channel_post_views_insert on public.channel_post_views for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy channel_post_views_read on public.channel_post_views for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.channel_post_views from anon, authenticated;
grant select on public.channel_post_views to authenticated;
grant insert (post_id) on public.channel_post_views to authenticated;
