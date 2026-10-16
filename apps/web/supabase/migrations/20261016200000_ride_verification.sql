-- Rides: identity verification for everyone and an emergency button
-- (spec docs/superpowers/specs/2026-10-16-ride-verification-emergency-design.md, plan
-- docs/superpowers/plans/2026-10-16-ride-verification-emergency.md). Builds on 20261015220000_ride_safety.
--
-- Engineering calls:
-- - Rollout switch: every gate runs only when private.setting_on('rides_require_verification') (seeded false; on once a
--   real provider account exists). When on, unverified fans' offers and seeks are hidden from others (restrictive
--   select policy; nothing is deleted) and their pending requests cannot be accepted (peer_not_verified).
-- - Which actions: offer → identity + licence + car; seek → identity; a request on a seek (answering as the driver) →
--   identity + licence + car; a request on an offer → identity; meet is unaffected. Codes verify_identity,
--   verify_licence, no_car, checked in the existing ride triggers after the 18+ gate.
-- - We store results, never images, document numbers or document birth dates. The identity row keeps a keyed
--   fingerprint of the document number (HMAC-SHA256, computed by the server with a secret it never sends here),
--   unique among approved identities. A fingerprint already on another account (approved or expired), or on a fan
--   suspended from rides or banned, is rejected duplicate_identity.
-- - Sessions: begin_verification(kind) opens a pending row (the session id the provider echoes back). At most 3
--   sessions per fan per kind in total (verify_limit), unless an admin resets them (counted = false). The licence comes
--   after the ID. The provider's result arrives only through verification_result() (service role, the webhook):
--   one decision per session (a repeat changes nothing), the document birth date compared with profiles.birth_date
--   (dob_mismatch), a licence held at least 2 years (licence_too_new), an expired document refused (doc_expired).
--   Approval lasts 2 years (a licence until its own expiry when earlier) and supersedes the fan's older approval.
-- - Cars: written only by the server after the Ministry of Transport registry lookup (set_fan_car, service role); one
--   active car per driver; make/model/colour on the ride card, the plate only to the driver and accepted riders.
-- - Emergency: report_ride_emergency(trip) by the driver or an accepted rider of an offer or seek, from 30 minutes
--   before departure (fans meet at the pickup early) until kickoff + 4 hours (full time + 2 hours). One per fan per trip
--   per 10 minutes (the same incident is returned, created = false). An open incident keeps the trip and its requests
--   (no delete) and keeps everyone involved from deleting their account; it suspends nobody. Admins acknowledge and
--   close (audited). onefan is not a 24/7 call centre: 100 is the emergency path (the button dials it).

-- ===================== 1. the switch =====================
insert into private.app_settings (key, value) values ('rides_require_verification', 'false');

-- ===================== 2. verifications =====================
create table public.fan_verifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('identity', 'licence')),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  provider         varchar(20) not null default '',
  provider_ref     varchar(120) unique,
  doc_fingerprint  text check (doc_fingerprint ~ '^[0-9a-f]{64}$'),
  reason_code      varchar(40),
  counted          boolean not null default true,   -- false once an admin resets the attempts
  approved_at      timestamptz,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index fan_verifications_user_idx on public.fan_verifications (user_id, kind, created_at desc);
create unique index fan_verifications_identity_fp_idx on public.fan_verifications (doc_fingerprint)
  where kind = 'identity' and status = 'approved';
create index fan_verifications_fp_idx on public.fan_verifications (doc_fingerprint) where doc_fingerprint is not null;
create index fan_verifications_recent_idx on public.fan_verifications (created_at desc);
alter table public.fan_verifications enable row level security;  -- no policies: read through my_verification()
revoke all on public.fan_verifications from public, anon, authenticated;

create table public.fan_cars (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  plate       varchar(8) not null check (plate ~ '^[0-9]{7,8}$'),
  make        varchar(40) not null default '',
  model       varchar(60) not null default '',
  colour      varchar(30) not null default '',
  year        smallint check (year between 1900 and 2100),
  active      boolean not null default true,
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create unique index fan_cars_active_idx on public.fan_cars (user_id) where active;
create index fan_cars_user_idx on public.fan_cars (user_id, created_at desc);
alter table public.fan_cars enable row level security;  -- no policies: written by set_fan_car, read through functions
revoke all on public.fan_cars from public, anon, authenticated;

-- Used inside row rules (policies and triggers), so signed-in fans may run them; the private schema is not exposed.
create function private.verified(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fan_verifications v
                  where v.user_id = p_user and v.kind = p_kind and v.status = 'approved' and v.expires_at > now())
$$;
create function private.has_car(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fan_cars c where c.user_id = p_user and c.active)
$$;
-- The first missing step for a ride role (null = nothing missing, or the switch is off).
create function private.ride_verify_missing(p_user uuid, p_driver boolean) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not private.setting_on('rides_require_verification') then null
    when not private.verified(p_user, 'identity') then 'verify_identity'
    when p_driver and not private.verified(p_user, 'licence') then 'verify_licence'
    when p_driver and not private.has_car(p_user) then 'no_car'
  end
$$;
-- May others see this fan's trip of this kind? (meet always; offer needs the driver set; seek the identity.)
create function private.ride_poster_ok(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_kind not in ('offer', 'seek') or private.ride_verify_missing(p_user, p_kind = 'offer') is null
$$;
revoke all on function private.verified(uuid, text), private.has_car(uuid), private.ride_verify_missing(uuid, boolean),
  private.ride_poster_ok(uuid, text) from public, anon;
grant execute on function private.verified(uuid, text), private.has_car(uuid), private.ride_verify_missing(uuid, boolean),
  private.ride_poster_ok(uuid, text) to authenticated, service_role;

-- A new provider session for the caller. Returns the session id the provider echoes back in its webhook.
create function public.begin_verification(p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_id uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('identity', 'licence') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('verify:' || me::text, 0));
  if private.verified(me, p_kind) then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;
  if p_kind = 'licence' and not private.verified(me, 'identity') then
    raise exception 'verify_identity' using errcode = '42501';
  end if;
  if (select count(*) from public.fan_verifications v where v.user_id = me and v.kind = p_kind and v.counted) >= 3 then
    raise exception 'verify_limit' using errcode = 'P0001';
  end if;
  insert into public.fan_verifications (user_id, kind) values (me, p_kind) returning id into v_id;
  return v_id;
end $$;

-- The provider's decision, from the webhook (service role only). Returns the session's final status.
create function public.verification_result(p_session uuid, p_provider text, p_provider_ref text, p_approved boolean,
                                           p_reason text default null, p_fingerprint text default null,
                                           p_doc_birth_date date default null, p_licence_issued date default null,
                                           p_doc_expires date default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_dob date;
  v_reason text;
  v_fp text := case when p_fingerprint ~ '^[0-9a-f]{64}$' then p_fingerprint end;
  v_expires timestamptz := now() + interval '2 years';
begin
  select f.id, f.user_id, f.kind, f.status into v from public.fan_verifications f where f.id = p_session for update;
  if not found then
    raise exception 'bad_session' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    return v.status;                               -- one decision per session: a repeat changes nothing
  end if;
  select p.birth_date into v_dob from public.profiles p where p.user_id = v.user_id;
  if p_approved is not true then
    v_reason := coalesce(nullif(left(btrim(coalesce(p_reason, '')), 40), ''), 'rejected');
  elsif v.kind = 'identity' and v_fp is null then
    v_reason := 'bad_fingerprint';
  elsif (v.kind = 'identity' or p_doc_birth_date is not null) and (v_dob is null or p_doc_birth_date is distinct from v_dob) then
    v_reason := 'dob_mismatch';
  elsif v.kind = 'identity' and exists (
          select 1 from public.fan_verifications o
           where o.doc_fingerprint = v_fp and o.kind = 'identity' and o.user_id <> v.user_id
             and (o.status in ('approved', 'expired') or private.ride_suspended(o.user_id) or private.is_banned(o.user_id))) then
    v_reason := 'duplicate_identity';
  elsif v.kind = 'licence' and (p_licence_issued is null or p_licence_issued > (current_date - interval '2 years')::date) then
    v_reason := 'licence_too_new';
  elsif p_doc_expires is not null and p_doc_expires < current_date then
    v_reason := 'doc_expired';
  end if;

  if v_reason is not null then
    update public.fan_verifications f
       set status = 'rejected', reason_code = v_reason, provider = left(coalesce(p_provider, ''), 20),
           provider_ref = left(p_provider_ref, 120), doc_fingerprint = case when v.kind = 'identity' then v_fp end,
           updated_at = now()
     where f.id = p_session;
    return 'rejected';
  end if;

  if v.kind = 'licence' and p_doc_expires is not null then
    v_expires := least(v_expires, p_doc_expires::timestamptz);
  end if;
  -- The fan's older approval of this kind is superseded first (the fingerprint stays unique among approved rows).
  update public.fan_verifications f set status = 'expired', updated_at = now()
   where f.user_id = v.user_id and f.kind = v.kind and f.status = 'approved' and f.id <> p_session;
  update public.fan_verifications f
     set status = 'approved', reason_code = null, approved_at = now(), expires_at = v_expires,
         provider = left(coalesce(p_provider, ''), 20), provider_ref = left(p_provider_ref, 120),
         doc_fingerprint = case when v.kind = 'identity' then v_fp end, updated_at = now()
   where f.id = p_session;
  return 'approved';
end $$;

-- One kind's state for a fan: none / pending / approved / rejected / expired, the reason, and attempts left.
create function private.verification_state(p_user uuid, p_kind text)
returns table (status text, reason text, attempts_left int)
language sql stable security definer set search_path = '' as $$
  select case
           when private.verified(p_user, p_kind) then 'approved'
           when l.status is null then 'none'
           when l.status in ('approved', 'expired') then 'expired'
           else l.status
         end,
         case when l.status = 'rejected' then l.reason_code::text end,
         greatest(3 - (select count(*)::int from public.fan_verifications c
                        where c.user_id = p_user and c.kind = p_kind and c.counted), 0)
    from (select 1) one
    left join lateral (select v.status, v.reason_code from public.fan_verifications v
                        where v.user_id = p_user and v.kind = p_kind order by v.created_at desc limit 1) l on true
$$;
revoke all on function private.verification_state(uuid, text) from public, anon, authenticated;

create function public.my_verification()
returns table (required boolean, identity_status text, identity_reason text, identity_left int, licence_status text,
               licence_reason text, licence_left int, car_plate text, car_make text, car_model text, car_colour text,
               car_year int)
language sql stable security definer set search_path = '' as $$
  select private.setting_on('rides_require_verification'), i.status, i.reason, i.attempts_left,
         l.status, l.reason, l.attempts_left, c.plate::text, c.make::text, c.model::text, c.colour::text, c.year::int
    from private.verification_state(auth.uid(), 'identity') i
   cross join private.verification_state(auth.uid(), 'licence') l
    left join public.fan_cars c on c.user_id = auth.uid() and c.active
   where auth.uid() is not null
$$;

-- The kind of the caller's own pending session (the demo screen), else null.
create function public.my_verification_session(p_session uuid) returns text
language sql stable security definer set search_path = '' as $$
  select v.kind from public.fan_verifications v
   where v.id = p_session and v.user_id = auth.uid() and v.status = 'pending'
$$;

-- ===================== 3. cars =====================
-- The server writes a car only after the registry lookup (service role). Five changes a day at most.
create function public.set_fan_car(p_user uuid, p_plate text, p_make text, p_model text, p_colour text,
                                   p_year int default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_plate is null or p_plate !~ '^[0-9]{7,8}$' then
    raise exception 'bad_plate' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('car:' || p_user::text, 0));
  if (select count(*) from public.fan_cars c where c.user_id = p_user and c.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  update public.fan_cars c set active = false where c.user_id = p_user and c.active;
  insert into public.fan_cars (user_id, plate, make, model, colour, year)
    values (p_user, p_plate, left(btrim(coalesce(p_make, '')), 40), left(btrim(coalesce(p_model, '')), 60),
            left(btrim(coalesce(p_colour, '')), 30), case when p_year between 1900 and 2100 then p_year end);
end $$;

create function public.remove_my_car() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.fan_cars c set active = false where c.user_id = auth.uid() and c.active;
  return found;
end $$;

-- The badge and the car on ride cards: fans of the caller's club; the car only for a fan with a visible current offer.
create function public.ride_trust(p_users uuid[])
returns table (user_id uuid, identity_ok boolean, driver_ok boolean, car_make text, car_model text, car_colour text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, private.verified(p.user_id, 'identity'),
         private.verified(p.user_id, 'identity') and private.verified(p.user_id, 'licence') and private.has_car(p.user_id),
         c.make::text, c.model::text, c.colour::text
    from public.profiles p
    left join public.fan_cars c on c.user_id = p.user_id and c.active
         and exists (select 1 from public.trips t join public.fixtures f on f.id = t.fixture_id
                      where t.user_id = p.user_id and t.kind = 'offer' and t.hidden_at is null
                        and f.kickoff_at > now() - interval '3 hours')
   where p.user_id = any (p_users[1:200])
     and p.team_id = (select public.my_team())
$$;

-- Plates: an offer's car to its driver and accepted riders; on a seek, the accepted driver's car to the seeker and them.
create function public.my_ride_plates(p_trips uuid[])
returns table (trip_id uuid, driver_id uuid, plate text)
language sql stable security definer set search_path = '' as $$
  select distinct t.id, c.user_id, c.plate::text
    from public.trips t
    join public.trip_requests q on q.trip_id = t.id and q.status = 'accepted'
    join public.fan_cars c on c.active and c.user_id = case when t.kind = 'offer' then t.user_id else q.user_id end
   where t.id = any (p_trips[1:200]) and t.kind in ('offer', 'seek')
     and (t.user_id = auth.uid() or q.user_id = auth.uid())
$$;

-- ===================== 4. the gates =====================
create or replace function private.trips_ride_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_missing text;
begin
  if auth.uid() is null then
    return new;
  end if;
  perform private.ride_gate(new.user_id);
  if new.women_only and not exists (select 1 from public.profiles p where p.user_id = new.user_id and p.gender = 'f') then
    raise exception 'women_only' using errcode = '42501';
  end if;
  if new.kind in ('offer', 'seek') then
    v_missing := private.ride_verify_missing(new.user_id, new.kind = 'offer');
    if v_missing is not null then
      raise exception '%', v_missing using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function private.trip_requests_ride_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_owner uuid;
  v_missing text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select t.kind, t.user_id into v_kind, v_owner from public.trips t where t.id = new.trip_id;
  if tg_op = 'INSERT' then
    perform private.ride_gate(new.user_id);
    if exists (select 1 from public.trips t where t.id = new.trip_id and t.women_only)
       and not exists (select 1 from public.profiles p where p.user_id = new.user_id and p.gender = 'f') then
      raise exception 'women_only' using errcode = '42501';
    end if;
    -- A seat on an offer needs the ID; answering a seek means driving: ID, licence and car.
    if v_kind in ('offer', 'seek') then
      v_missing := private.ride_verify_missing(new.user_id, v_kind = 'seek');
      if v_missing is not null then
        raise exception '%', v_missing using errcode = '42501';
      end if;
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
      if v_kind in ('offer', 'seek') then
        if private.ride_verify_missing(new.user_id, v_kind = 'seek') is not null then
          raise exception 'peer_not_verified' using errcode = '42501';
        end if;
        v_missing := private.ride_verify_missing(v_owner, v_kind = 'offer');
        if v_missing is not null then
          raise exception '%', v_missing using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

create policy trips_verified_or_hidden on public.trips as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_app_admin()) or private.ride_poster_ok(user_id, kind));

-- ---------- admin: attempts, birth date, issues ----------
alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('remove', 'ban', 'unban', 'status', 'auto_hide', 'restore', 'ride_suspend', 'ride_unsuspend',
                    'verify_reset', 'birth_date_fix', 'incident_ack', 'incident_close'));

create function public.admin_reset_verification(p_user uuid, p_kind text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('identity', 'licence') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  update public.fan_verifications v set counted = false, updated_at = now()
   where v.user_id = p_user and v.kind = p_kind and v.counted;
  get diagnostics n = row_count;
  insert into public.admin_actions (admin_id, action, kind, target_user, note)
    values (auth.uid(), 'verify_reset', p_kind, p_user, n || ' attempts');
  return n;
end $$;

-- Resolves dob_mismatch after the admin checked the document with the fan (the date itself is not logged).
create function public.admin_set_birth_date(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  update public.profiles set birth_date = p_date where user_id = p_user;  -- checked by profiles_private_stamp
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (admin_id, action, target_user, note) values (auth.uid(), 'birth_date_fix', p_user, '');
end $$;

-- Fans stuck in verification (last 30 days): latest session rejected, or every attempt used without an approval.
create function public.admin_verification_issues(p_limit int default 50)
returns table (user_id uuid, nick text, kind text, reason_code text, used int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select x.user_id, p.nick::text, x.kind, x.reason_code::text, x.used, x.created_at
      from (select distinct on (v.user_id, v.kind) v.user_id, v.kind, v.status, v.reason_code, v.created_at,
                   (select count(*)::int from public.fan_verifications c
                     where c.user_id = v.user_id and c.kind = v.kind and c.counted) as used
              from public.fan_verifications v
             where v.created_at > now() - interval '30 days'
             order by v.user_id, v.kind, v.created_at desc) x
      left join public.profiles p on p.user_id = x.user_id
     where x.status = 'rejected' or (x.used >= 3 and not private.verified(x.user_id, x.kind))
     order by x.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ===================== 5. emergency =====================
create table public.ride_incidents (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null,                  -- no foreign keys: the record stays
  fixture_id       bigint,
  reporter_id      uuid,
  driver_id        uuid,
  from_city        varchar(40) not null default '',
  pickup           varchar(80) not null default '',
  car              varchar(160) not null default '',
  status           text not null default 'open' check (status in ('open', 'closed')),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid,
  closed_at        timestamptz,
  closed_by        uuid,
  created_at       timestamptz not null default now()
);
create index ride_incidents_open_idx on public.ride_incidents (created_at desc) where status = 'open';
create index ride_incidents_trip_open_idx on public.ride_incidents (trip_id) where status = 'open';
create index ride_incidents_reporter_idx on public.ride_incidents (reporter_id, trip_id, created_at desc);
create index ride_incidents_driver_open_idx on public.ride_incidents (driver_id) where status = 'open';
alter table public.ride_incidents enable row level security;  -- no policies: admins use the functions below
revoke all on public.ride_incidents from public, anon, authenticated;

create function private.trip_incident_open(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ride_incidents i where i.trip_id = p_trip and i.status = 'open')
$$;
-- The fan reported, drives, owns or rides in a trip with an open incident.
create function private.in_open_incident(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    exists (select 1 from public.ride_incidents i where i.status = 'open' and (i.reporter_id = p_user or i.driver_id = p_user))
    or exists (select 1 from public.trips t join public.ride_incidents i on i.trip_id = t.id and i.status = 'open'
                where t.user_id = p_user)
    or exists (select 1 from public.trip_requests q join public.ride_incidents i on i.trip_id = q.trip_id and i.status = 'open'
                where q.user_id = p_user and q.status = 'accepted'))
$$;
revoke all on function private.trip_incident_open(uuid), private.in_open_incident(uuid) from public, anon;
grant execute on function private.trip_incident_open(uuid), private.in_open_incident(uuid) to authenticated, service_role;

create policy trips_keep_during_incident on public.trips as restrictive for delete to authenticated
  using (not private.trip_incident_open(id));
create policy trip_requests_keep_during_incident on public.trip_requests as restrictive for delete to authenticated
  using (not private.trip_incident_open(trip_id));

-- The account cannot be deleted while a ride case or an incident the fan is part of is open. (private.ride_case_open
-- is left as it is: it also guards the harm-report auto-suspension, which an emergency must not switch off.)
create or replace function public.my_ride_case_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.ride_case_open(auth.uid()) or private.in_open_incident(auth.uid())
$$;

create function public.report_ride_emergency(p_trip uuid)
returns table (incident_id uuid, created boolean, from_city text, fixture_id bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  t record;
  v_id uuid;
  v_driver uuid;
  v_car text;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select tr.id, tr.user_id, tr.kind, tr.from_city, tr.pickup, tr.fixture_id, tr.depart_before_min, f.kickoff_at into t
    from public.trips tr join public.fixtures f on f.id = tr.fixture_id
   where tr.id = p_trip;
  if not found or t.kind not in ('offer', 'seek')
     or not (t.user_id = me or exists (select 1 from public.trip_requests q
                                        where q.trip_id = p_trip and q.user_id = me and q.status = 'accepted')) then
    raise exception 'not_in_ride' using errcode = '42501';
  end if;
  if now() < t.kickoff_at - make_interval(mins => t.depart_before_min + 30) or now() > t.kickoff_at + interval '4 hours' then
    raise exception 'emergency_window' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('emergency:' || me::text || ':' || p_trip::text, 0));
  select i.id into v_id from public.ride_incidents i
   where i.reporter_id = me and i.trip_id = p_trip and i.created_at > now() - interval '10 minutes'
   order by i.created_at desc limit 1;
  if v_id is not null then
    return query select v_id, false, t.from_city::text, t.fixture_id;
    return;
  end if;
  v_driver := case
    when t.kind = 'offer' then t.user_id
    when t.user_id <> me then me                     -- on a seek, the accepted driver raised it
    else (select q.user_id from public.trip_requests q where q.trip_id = p_trip and q.status = 'accepted'
           order by q.created_at limit 1)
  end;
  select concat_ws(' · ', nullif(btrim(c.make || ' ' || c.model), ''), nullif(c.colour, ''), c.plate) into v_car
    from public.fan_cars c where c.user_id = v_driver and c.active;
  insert into public.ride_incidents (trip_id, fixture_id, reporter_id, driver_id, from_city, pickup, car)
    values (p_trip, t.fixture_id, me, v_driver, t.from_city, t.pickup, left(coalesce(v_car, ''), 160))
    returning id into v_id;
  return query select v_id, true, t.from_city::text, t.fixture_id;
end $$;

create function public.admin_open_incidents(p_limit int default 50)
returns table (id uuid, created_at timestamptz, acknowledged_at timestamptz, trip_id uuid, kickoff_at timestamptz,
               from_city text, pickup text, reporter_nick text, driver_nick text, car text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select i.id, i.created_at, i.acknowledged_at, i.trip_id, f.kickoff_at, i.from_city::text, i.pickup::text,
           rp.nick::text, dp.nick::text, i.car::text
      from public.ride_incidents i
      left join public.fixtures f on f.id = i.fixture_id
      left join public.profiles rp on rp.user_id = i.reporter_id
      left join public.profiles dp on dp.user_id = i.driver_id
     where i.status = 'open'
     order by i.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- The badge: open incidents no admin has acknowledged yet.
create function public.admin_incident_count() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return (select count(*)::int from public.ride_incidents i where i.status = 'open' and i.acknowledged_at is null);
end $$;

create function public.admin_ack_incident(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.ride_incidents i set acknowledged_at = now(), acknowledged_by = auth.uid()
   where i.id = p_id and i.status = 'open' and i.acknowledged_at is null
   returning i.trip_id, i.reporter_id into v;
  if not found then
    return false;
  end if;
  insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
    values (auth.uid(), 'incident_ack', 'trip', v.trip_id::text, v.reporter_id, '');
  return true;
end $$;

create function public.admin_close_incident(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.ride_incidents i
     set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         acknowledged_at = coalesce(i.acknowledged_at, now()), acknowledged_by = coalesce(i.acknowledged_by, auth.uid())
   where i.id = p_id and i.status = 'open'
   returning i.trip_id, i.reporter_id into v;
  if not found then
    return false;
  end if;
  insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
    values (auth.uid(), 'incident_close', 'trip', v.trip_id::text, v.reporter_id, '');
  return true;
end $$;

-- ===================== privileges =====================
revoke all on function public.begin_verification(text), public.my_verification(), public.my_verification_session(uuid),
  public.remove_my_car(), public.ride_trust(uuid[]), public.my_ride_plates(uuid[]), public.report_ride_emergency(uuid),
  public.admin_reset_verification(uuid, text), public.admin_set_birth_date(uuid, date), public.admin_verification_issues(int),
  public.admin_open_incidents(int), public.admin_incident_count(), public.admin_ack_incident(uuid),
  public.admin_close_incident(uuid)
  from public, anon;
grant execute on function public.begin_verification(text), public.my_verification(), public.my_verification_session(uuid),
  public.remove_my_car(), public.ride_trust(uuid[]), public.my_ride_plates(uuid[]), public.report_ride_emergency(uuid),
  public.admin_reset_verification(uuid, text), public.admin_set_birth_date(uuid, date), public.admin_verification_issues(int),
  public.admin_open_incidents(int), public.admin_incident_count(), public.admin_ack_incident(uuid),
  public.admin_close_incident(uuid)
  to authenticated;
-- The provider result and car writes: the server only.
revoke all on function public.verification_result(uuid, text, text, boolean, text, text, date, date, date),
  public.set_fan_car(uuid, text, text, text, text, int)
  from public, anon, authenticated;
grant execute on function public.verification_result(uuid, text, text, boolean, text, text, date, date, date),
  public.set_fan_car(uuid, text, text, text, text, int)
  to service_role;
-- my_ride_case_open was replaced (create or replace keeps its grants).
