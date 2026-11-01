-- Channel unread marker + push-recipients resolver (2026-11-01). Instead of a notification row per fan per post
-- (unbounded fanout), one channel_reads row per fan tracks the last time they opened the news tab; the News tab shows
-- an unread dot when a newer post exists. Push on a new post resolves the club's fans-with-a-subscription via a keyset
-- RPC (service-role only), mirroring alert_recipients.

create table public.channel_reads (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  team_id      text not null default '',
  last_seen_at timestamptz not null default 'epoch'
);
alter table public.channel_reads enable row level security;
create policy channel_reads_own on public.channel_reads for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.channel_reads from anon, authenticated;
grant select on public.channel_reads to authenticated;   -- writes go only through the definer RPCs below

-- Is there a post in my club newer than the last time I opened the news tab?
create function public.channel_unread() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channel_posts p
    where p.team_id = (select public.my_team())
      and p.created_at > coalesce((select r.last_seen_at from public.channel_reads r where r.user_id = (select auth.uid())), 'epoch')
  )
$$;
revoke all on function public.channel_unread() from public, anon;
grant execute on function public.channel_unread() to authenticated;

-- Mark the news tab seen now.
create function public.channel_mark_seen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.channel_reads (user_id, team_id, last_seen_at)
    values ((select auth.uid()), (select public.my_team()), now())
  on conflict (user_id) do update set last_seen_at = now(), team_id = excluded.team_id;
end $$;
revoke all on function public.channel_mark_seen() from public, anon;
grant execute on function public.channel_mark_seen() to authenticated;

-- Fans of a club that have at least one push subscription, keyset-paginated by user_id. Service-role only (the push
-- dispatcher runs with the admin client), exactly like alert_recipients.
create function public.channel_post_recipients(p_club text, p_after uuid default null, p_limit int default 1000)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.user_id
    from public.profiles p
   where p.team_id = p_club
     and (p_after is null or p.user_id > p_after)
     and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
   order by p.user_id
   limit greatest(p_limit, 1)
$$;
revoke all on function public.channel_post_recipients(text, uuid, int) from public, anon, authenticated;
grant execute on function public.channel_post_recipients(text, uuid, int) to service_role;
