-- Keyset paging for match-alert recipients: the API returns at most 1000 rows per request, so the dispatcher reads
-- recipients page by page ordered by user_id (stable, index-backed by the profiles primary key). Same rules as before:
-- matches 'all' or no settings row, plus 'team' fans of either club; only fans with a push device.
drop function public.alert_recipients(bigint);

create function public.alert_recipients(p_fixture bigint, p_after uuid default null, p_limit int default 1000)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  with f as (
    select public.club_of_api(x.home_api_id) as home_club, public.club_of_api(x.away_api_id) as away_club
    from public.fixtures x where x.id = p_fixture
  )
  select p.user_id
  from f, public.profiles p
  left join public.notification_prefs n on n.user_id = p.user_id
  where p.user_id > coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid)
    and (coalesce(n.matches, 'all') = 'all'
         or (n.matches = 'team' and p.team_id in (f.home_club, f.away_club)))
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  order by p.user_id
  limit greatest(least(coalesce(p_limit, 1000), 1000), 1)
$$;
revoke all on function public.alert_recipients(bigint, uuid, int) from public, anon, authenticated;
grant execute on function public.alert_recipients(bigint, uuid, int) to service_role;
