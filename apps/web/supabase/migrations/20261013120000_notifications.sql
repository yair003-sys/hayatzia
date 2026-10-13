-- Notifications: per-fan settings, goal / full-time alerts for every league match, message-push filtering.
-- Alerts are written by a trigger on fixtures (one per fixture + kind + score, never deleted), broadcast on the
-- Realtime topic 'alerts' for the in-app banner, and claimed by the dispatch route (service_role) for web push.

-- ---------- settings ----------
create table public.notification_prefs (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  matches     text not null default 'all' check (matches in ('all', 'team', 'off')),
  messages    boolean not null default true,
  updated_at  timestamptz not null default now()
);
-- Fans who turned something off are few: these keep the recipient and message filters cheap.
create index notification_prefs_matches_idx on public.notification_prefs (matches) where matches <> 'all';
create index notification_prefs_messages_off_idx on public.notification_prefs (user_id) where not messages;

create function public.notification_prefs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger notification_prefs_touch before update on public.notification_prefs
  for each row execute function public.notification_prefs_touch();

alter table public.notification_prefs enable row level security;
create policy notification_prefs_own_read on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_prefs_own_insert on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_prefs_own_update on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;
-- user_id is allowed so an upsert may name it; the policies pin it to the fan.
grant insert (user_id, matches, messages), update (user_id, matches, messages) on public.notification_prefs to authenticated;
grant select on public.notification_prefs to service_role;

-- ---------- alert queue (server only) ----------
create table public.match_alerts (
  id              bigserial primary key,
  fixture_id      bigint not null references public.fixtures (id) on delete cascade,
  kind            text not null check (kind in ('goal', 'ft')),
  home_goals      smallint not null,
  away_goals      smallint not null,
  scoring_api_id  integer,                    -- the side that scored; null for full time or both sides at once
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (fixture_id, kind, home_goals, away_goals)
);
create index match_alerts_unsent_idx on public.match_alerts (id) where sent_at is null;

alter table public.match_alerts enable row level security;   -- no policies: fans have no access
revoke all on public.match_alerts from anon, authenticated;
revoke all on sequence public.match_alerts_id_seq from anon, authenticated;
grant select, update on public.match_alerts to service_role;

-- ---------- trigger on fixtures ----------
-- UPDATE only (a first insert / new season stays silent), and only for matches that kicked off in the last 4 hours
-- (a late backfill stays silent). A score that goes up makes one alert for the new score; a score that drops
-- (VAR) adds nothing and deletes nothing; reaching an already-alerted score again does nothing (unique key).
create function public.fixtures_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  oh int := coalesce(old.home_goals, 0);
  oa int := coalesce(old.away_goals, 0);
  nh int := coalesce(new.home_goals, 0);
  na int := coalesce(new.away_goals, 0);
  scorer int;
  a public.match_alerts;
begin
  if new.kickoff_at < now() - interval '4 hours' then
    return null;
  end if;

  if nh > oh or na > oa then
    scorer := case when nh > oh and na <= oa then new.home_api_id when na > oa and nh <= oh then new.away_api_id end;
    insert into public.match_alerts (fixture_id, kind, home_goals, away_goals, scoring_api_id)
      values (new.id, 'goal', nh, na, scorer)
      on conflict (fixture_id, kind, home_goals, away_goals) do nothing
      returning * into a;
    if a.id is not null then
      perform realtime.send(jsonb_build_object('id', a.id, 'fixture_id', a.fixture_id, 'kind', a.kind,
        'home_goals', a.home_goals, 'away_goals', a.away_goals, 'scoring_api_id', a.scoring_api_id), 'alert', 'alerts', true);
    end if;
  end if;

  if new.status in ('FT', 'AET', 'PEN') and old.status not in ('FT', 'AET', 'PEN') then
    a := null;
    insert into public.match_alerts (fixture_id, kind, home_goals, away_goals, scoring_api_id)
      values (new.id, 'ft', nh, na, null)
      on conflict (fixture_id, kind, home_goals, away_goals) do nothing
      returning * into a;
    if a.id is not null then
      perform realtime.send(jsonb_build_object('id', a.id, 'fixture_id', a.fixture_id, 'kind', a.kind,
        'home_goals', a.home_goals, 'away_goals', a.away_goals, 'scoring_api_id', a.scoring_api_id), 'alert', 'alerts', true);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.fixtures_alerts() from public, anon, authenticated;

create trigger fixtures_alerts after update of status, home_goals, away_goals on public.fixtures
  for each row
  when (old.status is distinct from new.status or old.home_goals is distinct from new.home_goals
        or old.away_goals is distinct from new.away_goals)
  execute function public.fixtures_alerts();

-- ---------- realtime: the public alerts topic for signed-in fans ----------
create policy alerts_channel_receive on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and realtime.topic() = 'alerts'
);

-- ---------- server functions (service_role only) ----------
-- Fans to push a match alert to: matches 'all' or no settings row, plus 'team' fans of either club.
-- Only fans with at least one push device are returned (nobody else can be reached).
create function public.alert_recipients(p_fixture bigint) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with f as (
    select public.club_of_api(x.home_api_id) as home_club, public.club_of_api(x.away_api_id) as away_club
    from public.fixtures x where x.id = p_fixture
  )
  select p.user_id
  from f, public.profiles p
  left join public.notification_prefs n on n.user_id = p.user_id
  where (coalesce(n.matches, 'all') = 'all'
         or (n.matches = 'team' and p.team_id in (f.home_club, f.away_club)))
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
$$;
revoke all on function public.alert_recipients(bigint) from public, anon, authenticated;
grant execute on function public.alert_recipients(bigint) to service_role;

-- The given fans minus those who turned message notifications off.
create function public.message_push_allowed(p_users uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct u from unnest(p_users) u
  where not exists (select 1 from public.notification_prefs n where n.user_id = u and not n.messages)
$$;
revoke all on function public.message_push_allowed(uuid[]) from public, anon, authenticated;
grant execute on function public.message_push_allowed(uuid[]) to service_role;

-- Takes up to p_limit unsent alerts (oldest first) and marks them sent in the same statement; concurrent
-- dispatchers skip each other's rows.
create function public.claim_alerts(p_limit int) returns setof public.match_alerts
language sql volatile security definer set search_path = '' as $$
  with c as (
    select id from public.match_alerts
    where sent_at is null
    order by id
    limit greatest(least(coalesce(p_limit, 50), 500), 0)
    for update skip locked
  )
  update public.match_alerts m set sent_at = now()
  from c where m.id = c.id
  returning m.*
$$;
revoke all on function public.claim_alerts(int) from public, anon, authenticated;
grant execute on function public.claim_alerts(int) to service_role;
