-- Ride safety pack (spec docs/superpowers/specs/2026-10-15-ride-safety-design.md, rules 1–11). Rides connect strangers;
-- the database enforces who may offer, request and rate a ride, and suspends a fan from rides at once on a harm report.
--
-- Engineering calls:
-- - profiles get gender ('m' / 'f' / 'x' = לא מציין, null = not answered), adult_confirmed_at and ride_safety_seen_at.
--   Fans update only these three and the nickname on their own row (column grants). The two times are stamped by the
--   database (now()) and, once given, are never cleared or moved (the record of when the fan confirmed).
-- - Gender is "shown only in rides": the three new columns are not readable by other fans at all (profiles' select
--   grant becomes column-level, without them). The fan reads their own through my_ride_profile(); ride cards get
--   "is the driver a woman" through ride_drivers(), only for drivers of the caller's club with an active, visible
--   ride offer (never a fan who only seeks rides).
-- - Every ride rule is checked in BEFORE triggers with clear codes: not_adult, banned, ride_suspended, women_only,
--   phone_required, ride_started. A row written by the service role or a database job (no auth.uid()) is not checked.
-- - Once the match has kicked off, a ride offer is evidence: its requests' status cannot change (no declining a rider
--   to stop a rating) and, with an accepted rider, the ride cannot be deleted.
-- - Settings: private.app_settings (key → jsonb), read by private.setting_on(key). 'rides_require_phone' = false until
--   SMS sign-in exists; then: update private.app_settings set value = 'true' where key = 'rides_require_phone';
-- - "The match is over" (ratings): fixture status FT / AET / PEN, or kickoff + 2 hours has passed (the score feed may
--   lag; a match is over by then in practice).
-- - rides_completed = the driver's ride offers whose match reached full time (FT / AET / PEN) with at least one accepted
--   rider at that moment. Counted once per trip through the ride_completions ledger (trip_id pk), by a trigger on
--   fixtures when the status turns final; a revert removes exactly the ledger rows it counted (no drift, no counting at
--   read time).
-- - Ratings outlive the trip (no foreign key on trip_id): a driver cannot erase ratings by deleting the trip.
-- - Ride suspension hides the fan's rides and pending requests from everyone else through restrictive select policies
--   (nothing is hidden_at-marked, so lifting the suspension brings them back as they were). While a ride case is open
--   (active ride suspension, or an open harm report about the fan) the fan cannot delete rides, withdraw requests or
--   delete the account (rule 11: keep all data).
-- - Abuse guard on the automatic suspension (no brigading, no counter-suspension). It happens only when ALL hold:
--   the reporter confirmed 18+, is in the reported fan's club, and their account is older than the auto-hide minimum
--   age (private.auto_hide_rules()); the two share a ride request (either direction) from the last 30 days; the
--   reporter triggered no other auto-suspension in the last 7 days; the reporter has no open ride case of their own;
--   the reported fan is not an admin. Any other harm report still reaches the admins as urgent.
--   reports.ride_suspended records which report suspended someone (for the 7-day limit and the admin push text).

-- ---------- 1. settings ----------
create table private.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table private.app_settings enable row level security;  -- no policies: read through private.setting_on()
revoke all on private.app_settings from public, anon, authenticated;
insert into private.app_settings (key, value) values ('rides_require_phone', 'false');

create function private.setting_on(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value = 'true'::jsonb from private.app_settings s where s.key = p_key), false)
$$;
revoke all on function private.setting_on(text) from public, anon, authenticated;

-- ---------- 2. profiles: gender, 18+ and the safety screen ----------
alter table public.profiles
  add column gender text check (gender in ('m', 'f', 'x')),
  add column adult_confirmed_at timestamptz,
  add column ride_safety_seen_at timestamptz;

revoke select on public.profiles from authenticated;
grant select (user_id, nick, team_id, created_at, terms_version) on public.profiles to authenticated;
grant update (nick, gender, adult_confirmed_at, ride_safety_seen_at) on public.profiles to authenticated;

create function private.profiles_ride_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.adult_confirmed_at := case when new.adult_confirmed_at is not null then now() end;
    new.ride_safety_seen_at := case when new.ride_safety_seen_at is not null then now() end;
    return new;
  end if;
  if new.adult_confirmed_at is distinct from old.adult_confirmed_at then
    new.adult_confirmed_at := coalesce(old.adult_confirmed_at, case when new.adult_confirmed_at is not null then now() end);
  end if;
  if new.ride_safety_seen_at is distinct from old.ride_safety_seen_at then
    new.ride_safety_seen_at := coalesce(old.ride_safety_seen_at, case when new.ride_safety_seen_at is not null then now() end);
  end if;
  return new;
end $$;
revoke all on function private.profiles_ride_stamp() from public, anon, authenticated;
create trigger profiles_ride_stamp before insert or update on public.profiles
  for each row execute function private.profiles_ride_stamp();

-- ---------- 3. trips: public pickup point and women-only ----------
alter table public.trips
  add column pickup varchar(80) not null default '',
  add column women_only boolean not null default false;
grant insert (pickup, women_only) on public.trips to authenticated;
-- "Rides of this match that had a rider" when the match ends.
create index trips_fixture_offer_idx on public.trips (fixture_id) where kind = 'offer';

drop trigger zz_moderate on public.trips;
create trigger zz_moderate before insert or update on public.trips
  for each row execute function private.moderate_row('from_city:name', 'pickup:name', 'note:text');

-- ---------- 4. ride suspensions ----------
create table public.ride_suspensions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  reason      varchar(120) not null default '',
  by_report   uuid references public.reports (id) on delete set null,
  created_at  timestamptz not null default now(),
  lifted_at   timestamptz,                        -- null = active
  lifted_by   uuid                                -- no foreign key: the record stays
);
create index ride_suspensions_active_idx on public.ride_suspensions (created_at desc) where lifted_at is null;
create index ride_suspensions_report_idx on public.ride_suspensions (by_report);
alter table public.ride_suspensions enable row level security;  -- no policies: admins use the RPCs below
revoke all on public.ride_suspensions from public, anon, authenticated;

-- The one reason that suspends from rides (also in features/safety/schema.ts RIDE_HARM_REASON).
create function private.ride_harm_reason() returns text
language sql immutable set search_path = '' as $$
  select 'הטרדה או פגיעה בנסיעה'::text
$$;
revoke all on function private.ride_harm_reason() from public, anon, authenticated;

-- Used inside row rules (policies), so signed-in fans may run it; the private schema is not exposed by the API.
create function private.ride_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ride_suspensions s where s.user_id = p_user and s.lifted_at is null)
$$;
revoke all on function private.ride_suspended(uuid) from public, anon;
grant execute on function private.ride_suspended(uuid) to authenticated, service_role;

-- A ride case is open: an active ride suspension, or an open harm report about the fan or one of their rides.
-- Reports by the (kind, ref, reporter_id) where status = 'open' index; trips by trips_user_idx.
create function private.ride_case_open(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    private.ride_suspended(p_user)
    or exists (select 1 from public.reports r
                where r.status = 'open' and r.kind = 'user' and r.ref = p_user::text
                  and r.reason = private.ride_harm_reason())
    or exists (select 1 from public.trips t
                 join public.reports r on r.kind = 'trip' and r.ref = t.id::text and r.status = 'open'
                where t.user_id = p_user and r.reason = private.ride_harm_reason())
  )
$$;
revoke all on function private.ride_case_open(uuid) from public, anon;
grant execute on function private.ride_case_open(uuid) to authenticated, service_role;

-- ---------- 5. who may offer and request ----------
create function private.ride_gate(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.user_id = p_user and p.adult_confirmed_at is not null) then
    raise exception 'not_adult' using errcode = '42501';
  end if;
  if private.is_banned(p_user) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if private.ride_suspended(p_user) then
    raise exception 'ride_suspended' using errcode = '42501';
  end if;
  if private.setting_on('rides_require_phone')
     and not exists (select 1 from auth.users u where u.id = p_user and u.phone_confirmed_at is not null) then
    raise exception 'phone_required' using errcode = '42501';
  end if;
end $$;
revoke all on function private.ride_gate(uuid) from public, anon, authenticated;

create function private.trips_ride_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  perform private.ride_gate(new.user_id);
  if new.women_only and not exists (select 1 from public.profiles p where p.user_id = new.user_id and p.gender = 'f') then
    raise exception 'women_only' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.trips_ride_rules() from public, anon, authenticated;
create trigger trips_ride_rules before insert on public.trips
  for each row execute function private.trips_ride_rules();

-- A request: the rider passes the gate, and a women-only ride takes requests from women only. Accepting: neither the
-- rider nor the driver may be suspended from rides.
create function private.trip_requests_ride_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform private.ride_gate(new.user_id);
    if exists (select 1 from public.trips t where t.id = new.trip_id and t.women_only)
       and not exists (select 1 from public.profiles p where p.user_id = new.user_id and p.gender = 'f') then
      raise exception 'women_only' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status then
    if exists (select 1 from public.trips t join public.fixtures f on f.id = t.fixture_id
                where t.id = new.trip_id and t.kind = 'offer' and f.kickoff_at <= now()) then
      raise exception 'ride_started' using errcode = 'P0001';
    end if;
    if new.status = 'accepted' then
      if private.is_banned(new.user_id) or private.is_banned(auth.uid()) then
        raise exception 'banned' using errcode = '42501';
      end if;
      if private.ride_suspended(new.user_id) or private.ride_suspended(auth.uid()) then
        raise exception 'ride_suspended' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.trip_requests_ride_rules() from public, anon, authenticated;
create trigger trip_requests_ride_rules before insert or update of status on public.trip_requests
  for each row execute function private.trip_requests_ride_rules();

-- ---------- 6. what a suspension hides, and what an open case keeps ----------
create policy trips_not_ride_suspended on public.trips as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or not private.ride_suspended(user_id));
create policy trip_requests_not_ride_suspended on public.trip_requests as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or not private.ride_suspended(user_id));
create policy trips_keep_during_case on public.trips as restrictive for delete to authenticated
  using (not (select private.ride_case_open(auth.uid())));
create policy trip_requests_keep_during_case on public.trip_requests as restrictive for delete to authenticated
  using (not (select private.ride_case_open(auth.uid())));

-- A ride offer whose match has kicked off with an accepted rider is kept (ratings, evidence).
create function private.trip_locked(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trips t join public.fixtures f on f.id = t.fixture_id
     where t.id = p_trip and t.kind = 'offer' and f.kickoff_at <= now()
       and exists (select 1 from public.trip_requests r where r.trip_id = t.id and r.status = 'accepted'))
$$;
revoke all on function private.trip_locked(uuid) from public, anon;
grant execute on function private.trip_locked(uuid) to authenticated, service_role;
create policy trips_keep_after_kickoff on public.trips as restrictive for delete to authenticated
  using (not private.trip_locked(id));

-- ---------- 7. ratings and driver stats ----------
create table public.ride_ratings (
  trip_id     uuid not null,                       -- no foreign key: the rating outlives the trip
  rater_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  driver_id   uuid not null references auth.users (id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  created_at  timestamptz not null default now(),
  primary key (trip_id, rater_id)
);
create index ride_ratings_driver_idx on public.ride_ratings (driver_id);
create index ride_ratings_rater_idx on public.ride_ratings (rater_id, created_at desc);

-- One row per ride counted as completed (the ledger behind ride_driver_stats.rides_completed).
create table public.ride_completions (
  trip_id     uuid primary key,                    -- no foreign key: the count outlives the trip
  fixture_id  bigint not null,
  driver_id   uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index ride_completions_fixture_idx on public.ride_completions (fixture_id);
create index ride_completions_driver_idx on public.ride_completions (driver_id);
alter table public.ride_completions enable row level security;  -- no policies: written by the fixtures trigger only
revoke all on public.ride_completions from public, anon, authenticated;

create table public.ride_driver_stats (
  driver_id        uuid primary key references auth.users (id) on delete cascade,
  rides_completed  integer not null default 0,
  ratings_count    integer not null default 0,
  ratings_sum      integer not null default 0
);

-- Only an accepted rider of a ride offer, once the match is over, once (primary key). The driver comes from the trip.
create function private.ride_ratings_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  new.rater_id := coalesce(auth.uid(), new.rater_id);
  new.created_at := now();
  select tr.user_id, tr.kind, f.kickoff_at, f.status into t
    from public.trips tr join public.fixtures f on f.id = tr.fixture_id
   where tr.id = new.trip_id;
  if not found or t.kind <> 'offer' then
    raise exception 'not_a_ride' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trip_requests r
                  where r.trip_id = new.trip_id and r.user_id = new.rater_id and r.status = 'accepted') then
    raise exception 'not_a_rider' using errcode = '42501';
  end if;
  if not (t.status in ('FT', 'AET', 'PEN') or t.kickoff_at + interval '2 hours' <= now()) then
    raise exception 'ride_not_over' using errcode = 'P0001';
  end if;
  new.driver_id := t.user_id;
  return new;
end $$;
revoke all on function private.ride_ratings_check() from public, anon, authenticated;
create trigger ride_ratings_check before insert on public.ride_ratings
  for each row execute function private.ride_ratings_check();

create function private.ride_ratings_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ride_driver_stats as s (driver_id, ratings_count, ratings_sum)
      values (new.driver_id, 1, new.stars)
    on conflict (driver_id) do update
      set ratings_count = s.ratings_count + 1, ratings_sum = s.ratings_sum + excluded.ratings_sum;
  else
    update public.ride_driver_stats s
       set ratings_count = greatest(s.ratings_count - 1, 0), ratings_sum = greatest(s.ratings_sum - old.stars, 0)
     where s.driver_id = old.driver_id;
  end if;
  return null;
end $$;
revoke all on function private.ride_ratings_count() from public, anon, authenticated;
create trigger ride_ratings_count after insert or delete on public.ride_ratings
  for each row execute function private.ride_ratings_count();

-- A match reaches full time: each driver of a ride offer with an accepted rider gets one completed ride (and loses it
-- again if the feed takes the final status back).
create function private.fixtures_ride_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_over boolean := coalesce(old.status, '') in ('FT', 'AET', 'PEN');
  is_over boolean := coalesce(new.status, '') in ('FT', 'AET', 'PEN');
begin
  if was_over = is_over then
    return null;
  end if;
  if is_over then
    with added as (
      insert into public.ride_completions (trip_id, fixture_id, driver_id)
        select t.id, t.fixture_id, t.user_id
          from public.trips t
         where t.fixture_id = new.id and t.kind = 'offer'
           and exists (select 1 from public.trip_requests r where r.trip_id = t.id and r.status = 'accepted')
      on conflict (trip_id) do nothing
      returning driver_id
    )
    insert into public.ride_driver_stats as s (driver_id, rides_completed)
      select a.driver_id, count(*)::int from added a group by a.driver_id
    on conflict (driver_id) do update set rides_completed = s.rides_completed + excluded.rides_completed;
  else
    with removed as (
      delete from public.ride_completions c where c.fixture_id = new.id returning c.driver_id
    ), n as (
      select r.driver_id, count(*)::int as n from removed r group by r.driver_id
    )
    update public.ride_driver_stats s set rides_completed = greatest(s.rides_completed - n.n, 0)
      from n where s.driver_id = n.driver_id;
  end if;
  return null;
end $$;
revoke all on function private.fixtures_ride_stats() from public, anon, authenticated;
create trigger fixtures_ride_stats after update of status on public.fixtures
  for each row when (old.status is distinct from new.status) execute function private.fixtures_ride_stats();

alter table public.ride_ratings enable row level security;
alter table public.ride_driver_stats enable row level security;
create policy ride_ratings_insert_own on public.ride_ratings for insert to authenticated
  with check (rater_id = (select auth.uid()));
create policy ride_ratings_read_own on public.ride_ratings for select to authenticated
  using (rater_id = (select auth.uid()));
-- Rides are club-scoped: the stats of drivers of the caller's club.
create policy ride_driver_stats_read_club on public.ride_driver_stats for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = driver_id and p.team_id = (select public.my_team())));
revoke all on public.ride_ratings, public.ride_driver_stats from public, anon, authenticated;
grant select on public.ride_ratings, public.ride_driver_stats to authenticated;
grant insert (trip_id, stars) on public.ride_ratings to authenticated;

-- ---------- 8. the harm report: immediate suspension from rides ----------
-- Which report suspended someone automatically (fans cannot set it: their insert grant is kind, ref, reason, note).
alter table public.reports add column ride_suspended boolean not null default false;

alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('remove', 'ban', 'unban', 'status', 'auto_hide', 'restore', 'ride_suspend', 'ride_unsuspend'));

create function private.reports_ride_harm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_target uuid;
  rules record;
begin
  if new.reason <> private.ride_harm_reason() or new.kind not in ('trip', 'user') or new.reporter_id is null then
    return null;
  end if;
  select t.target_user into v_target from private.report_target(new.kind, new.ref::text, new.reporter_id) t;
  if v_target is null or v_target = new.reporter_id
     or exists (select 1 from public.app_admins a where a.user_id = v_target) then
    return null;
  end if;
  select * into rules from private.auto_hide_rules();
  -- A ride user of the same club, with an account older than the minimum age.
  if not exists (select 1 from public.profiles r join public.profiles x on x.team_id = r.team_id
                  where r.user_id = new.reporter_id and r.adult_confirmed_at is not null
                    and r.created_at <= new.created_at - rules.min_account_age and x.user_id = v_target)
     -- No counter-suspension: a reporter with an open ride case of their own does not suspend anyone.
     or private.ride_case_open(new.reporter_id)
     -- The two really shared a ride: a request between them (either direction) in the last 30 days.
     or not exists (select 1 from public.trip_requests q join public.trips t on t.id = q.trip_id
                     where q.created_at > now() - interval '30 days'
                       and ((q.user_id = new.reporter_id and t.user_id = v_target)
                            or (q.user_id = v_target and t.user_id = new.reporter_id)))
     -- At most one automatic suspension per reporter in 7 days (reports_reporter_idx).
     or exists (select 1 from public.reports p
                 where p.reporter_id = new.reporter_id and p.ride_suspended and p.created_at > now() - interval '7 days') then
    return null;
  end if;
  insert into public.ride_suspensions as s (user_id, reason, by_report)
    values (v_target, left(new.reason || case when new.note <> '' then ': ' || new.note else '' end, 120), new.id)
  on conflict (user_id) do update
    set reason = excluded.reason, by_report = excluded.by_report, created_at = now(), lifted_at = null, lifted_by = null
    where s.lifted_at is not null;               -- already suspended: the first report stays the reference
  if found then
    update public.reports r set ride_suspended = true where r.id = new.id;
    insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
      values (null, 'ride_suspend', new.kind, new.ref, v_target, 'harm report');
  end if;
  return null;
end $$;
revoke all on function private.reports_ride_harm() from public, anon, authenticated;
create trigger reports_ride_harm after insert on public.reports
  for each row execute function private.reports_ride_harm();

-- ---------- 9. functions for the app ----------
-- The caller's own ride state (the only way to read the three private profile columns).
create function public.my_ride_profile()
returns table (gender text, adult_confirmed boolean, safety_seen boolean, ride_suspended boolean, phone_required boolean,
               phone_ok boolean)
language sql stable security definer set search_path = '' as $$
  select p.gender, p.adult_confirmed_at is not null, p.ride_safety_seen_at is not null, private.ride_suspended(p.user_id),
         private.setting_on('rides_require_phone'),
         exists (select 1 from auth.users u where u.id = p.user_id and u.phone_confirmed_at is not null)
    from public.profiles p
   where p.user_id = auth.uid()
$$;

-- Trust facts for ride cards: join date, completed rides, ratings, and whether the driver is a woman. Only drivers of
-- the caller's club with an active (match from 3 hours ago on), visible ride offer: never a fan who only seeks rides,
-- so no one learns a rider's gender. At most 200 ids.
create function public.ride_drivers(p_users uuid[])
returns table (user_id uuid, member_since timestamptz, rides_completed integer, ratings_count integer,
               ratings_sum integer, female boolean)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.created_at, coalesce(s.rides_completed, 0), coalesce(s.ratings_count, 0),
         coalesce(s.ratings_sum, 0), coalesce(p.gender = 'f', false)
    from public.profiles p
    left join public.ride_driver_stats s on s.driver_id = p.user_id
   where p.user_id = any (p_users[1:200])
     and p.team_id = (select public.my_team())
     and not private.ride_suspended(p.user_id)
     and exists (select 1 from public.trips t join public.fixtures f on f.id = t.fixture_id
                  where t.user_id = p.user_id and t.kind = 'offer' and t.hidden_at is null
                    and f.kickoff_at > now() - interval '3 hours')
$$;

-- The delete-my-account action asks first (rule 11).
create function public.my_ride_case_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.ride_case_open(auth.uid())
$$;

-- Who gets the urgent push about a harm report. The server only (service role).
create function public.admin_user_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.user_id from public.app_admins a
$$;

-- A harm report filed through the app: the same row and triggers as a direct insert, and the answer whether it
-- suspended someone (so the admins' push says so only when it did).
create function public.report_ride_harm(p_kind text, p_ref text, p_note text default '')
returns table (report_id uuid, suspended boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('trip', 'user') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  insert into public.reports (reporter_id, kind, ref, reason, note)
    values (auth.uid(), p_kind, left(coalesce(p_ref, ''), 100), private.ride_harm_reason(), left(btrim(coalesce(p_note, '')), 120))
    returning id into v_id;
  return query select r.id, r.ride_suspended from public.reports r where r.id = v_id;
end $$;

-- Accepted riders of a just-suspended driver's upcoming ride offers, to tell them the ride is off for now. Server only.
create function public.ride_suspension_riders(p_report uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct q.user_id
    from public.ride_suspensions s
    join public.trips t on t.user_id = s.user_id and t.kind = 'offer'
    join public.fixtures f on f.id = t.fixture_id and f.kickoff_at > now()
    join public.trip_requests q on q.trip_id = t.id and q.status = 'accepted'
   where s.by_report = p_report and s.lifted_at is null
$$;

-- The caller's rides to rate: accepted on a ride offer in the last 30 days, match over, not rated yet. Security definer
-- so a rider can still rate a driver whose rides are hidden by a ride suspension.
create function public.my_rides_to_rate()
returns table (trip_id uuid, driver_nick text, kickoff_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.nick::text, f.kickoff_at
    from public.trip_requests q
    join public.trips t on t.id = q.trip_id and t.kind = 'offer'
    join public.fixtures f on f.id = t.fixture_id
   where q.user_id = auth.uid() and q.status = 'accepted' and q.created_at > now() - interval '30 days'
     and (f.status in ('FT', 'AET', 'PEN') or f.kickoff_at + interval '2 hours' <= now())
     and not exists (select 1 from public.ride_ratings x where x.trip_id = t.id and x.rater_id = auth.uid())
   order by f.kickoff_at desc
   limit 20
$$;

-- Admins: fans suspended from rides right now (newest first), and lifting a suspension.
create function public.admin_ride_suspensions(p_limit int default 50)
returns table (user_id uuid, nick text, reason text, created_at timestamptz, by_report uuid)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select s.user_id, p.nick::text, s.reason::text, s.created_at, s.by_report
      from public.ride_suspensions s
      left join public.profiles p on p.user_id = s.user_id
     where s.lifted_at is null
     order by s.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create function public.admin_lift_ride_suspension(p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_done boolean;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.ride_suspensions s set lifted_at = now(), lifted_by = auth.uid()
   where s.user_id = p_user and s.lifted_at is null;
  v_done := found;
  insert into public.admin_actions (admin_id, action, target_user, note)
    values (auth.uid(), 'ride_unsuspend', p_user, case when v_done then '' else 'was not suspended' end);
  return v_done;
end $$;

revoke all on function public.report_ride_harm(text, text, text) from public, anon;
revoke all on function public.ride_suspension_riders(uuid) from public, anon, authenticated;
revoke all on function public.my_rides_to_rate() from public, anon;
grant execute on function public.report_ride_harm(text, text, text) to authenticated;
grant execute on function public.ride_suspension_riders(uuid) to service_role;
grant execute on function public.my_rides_to_rate() to authenticated;
revoke all on function public.my_ride_profile() from public, anon;
revoke all on function public.ride_drivers(uuid[]) from public, anon;
revoke all on function public.my_ride_case_open() from public, anon;
revoke all on function public.admin_user_ids() from public, anon, authenticated;
revoke all on function public.admin_ride_suspensions(int) from public, anon;
revoke all on function public.admin_lift_ride_suspension(uuid) from public, anon;
grant execute on function public.my_ride_profile() to authenticated;
grant execute on function public.ride_drivers(uuid[]) to authenticated;
grant execute on function public.my_ride_case_open() to authenticated;
grant execute on function public.admin_user_ids() to service_role;
grant execute on function public.admin_ride_suspensions(int) to authenticated;
grant execute on function public.admin_lift_ride_suspension(uuid) to authenticated;
