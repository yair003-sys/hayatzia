-- Security review 2026-10-17: a batch of hardening fixes (docs/security-fixes-2026-10-17.md).
-- Each change keeps behaviour identical for honest users and never weakens an existing rule.
--
-- H1  ride-harm report abuse: the "two fans shared a ride" link must be an accepted request on a match that already
--     kicked off, and the linking request cannot be deleted while either fan is in an open harm case.
-- M1  push: the browser-push host allowlist is enforced in the database too (not only in schema.ts); the alert
--     dispatch marks an alert delivered only after a successful send (a lease, so a cut-off run is retried, never lost).
-- M2  DM request enumeration: the daily cap is counted first and counts refused attempts too, and the refusal is
--     generic (it never reveals whether the target's setting is team/QR-only or the cap was reached).
-- M3  women-only rides: gender is set once (then only an admin may change it), and when the verification switch is on a
--     women-only ride needs an approved identity for the fan (driver and rider).
-- M4  uploads: a per-fan object cap per bucket (300 objects), enforced by a trigger on storage.objects.
-- M5+L2 group spam / block disclosure: a daily cap on new groups and invites, a cooldown before re-inviting a fan who
--     declined or was removed, and a generic (silent) skip for a block so an admin cannot learn of a block between two
--     other fans.

-- ============================================================================================================
-- H1 — ride-harm report abuse
-- ============================================================================================================
-- The "two fans really shared a ride" check now requires an ACCEPTED request on a trip whose match has already kicked
-- off (the same f.kickoff_at <= now() test the ride code uses). A pending request, or an accepted one before kickoff,
-- is not evidence of a shared ride and must not auto-suspend anyone.
create or replace function private.reports_ride_harm() returns trigger
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
  if not exists (select 1 from public.profiles r join public.profiles x on x.team_id = r.team_id
                  where r.user_id = new.reporter_id and private.is_adult(r.user_id)
                    and r.created_at <= new.created_at - rules.min_account_age and x.user_id = v_target)
     or private.ride_case_open(new.reporter_id)
     -- The shared ride must be an ACCEPTED request on a trip whose match has started (H1, 2026-10-17).
     or not exists (select 1 from public.trip_requests q
                      join public.trips t on t.id = q.trip_id
                      join public.fixtures f on f.id = t.fixture_id
                     where q.status = 'accepted' and f.kickoff_at <= now()
                       and q.created_at > now() - interval '30 days'
                       and ((q.user_id = new.reporter_id and t.user_id = v_target)
                            or (q.user_id = v_target and t.user_id = new.reporter_id)))
     or exists (select 1 from public.reports p
                 where p.reporter_id = new.reporter_id and p.ride_suspended and p.created_at > now() - interval '7 days') then
    return null;
  end if;
  insert into public.ride_suspensions as s (user_id, reason, by_report)
    values (v_target, left(new.reason || case when new.note <> '' then ': ' || new.note else '' end, 120), new.id)
  on conflict (user_id) do update
    set reason = excluded.reason, by_report = excluded.by_report, created_at = now(), lifted_at = null, lifted_by = null
    where s.lifted_at is not null;
  if found then
    update public.reports r set ride_suspended = true where r.id = new.id;
    insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
      values (null, 'ride_suspend', new.kind, new.ref, v_target, 'harm report');
  end if;
  return null;
end $$;

-- Keep the linking request while either fan is in an open harm case (not only the deleter). Only the rider deletes
-- their own request row; extend the lock so the trip's driver being in a case also keeps it (the evidence stays).
-- Security definer so the driver's trip is looked up WITHOUT RLS (a ride-suspended driver's trip is hidden from the
-- rider, so an inline subquery in the policy would see nothing and wrongly allow the delete).
create function private.trip_request_driver_in_case(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips t where t.id = p_trip and private.ride_case_open(t.user_id))
$$;
revoke all on function private.trip_request_driver_in_case(uuid) from public, anon;
grant execute on function private.trip_request_driver_in_case(uuid) to authenticated, service_role;

drop policy trip_requests_keep_during_case on public.trip_requests;
create policy trip_requests_keep_during_case on public.trip_requests as restrictive for delete to authenticated
  using (
    not (select private.ride_case_open(auth.uid()))
    and not private.trip_request_driver_in_case(trip_id)
  );

-- ============================================================================================================
-- M1 — push endpoint allowlist (database) + alert delivery lease
-- ============================================================================================================
-- (a) Only the browsers' real push services, enforced in the database (the same allowlist as src/features/push/schema.ts).
--     An address a fan picks (any other host, a port, or a look-alike like fcm.googleapis.com.evil) is refused.
delete from public.push_subscriptions
 where endpoint !~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|notify\.windows\.com)(/|$)';
alter table public.push_subscriptions drop constraint push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check
  check (char_length(endpoint) < 1000
         and endpoint ~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|notify\.windows\.com)(/|$)');

-- (c) The dispatch used to mark an alert sent the moment it claimed it, so a run cut off after claiming lost those
--     pushes. Now claiming takes a short LEASE (claimed_at); the alert is marked sent only after a successful send
--     (mark_alerts_sent). A lease older than 2 minutes is re-claimable, so a crashed run is retried, never lost. The
--     30-minute stale sweep still prevents a backlog from starving fresh goals.
alter table public.match_alerts add column claimed_at timestamptz;

create or replace function public.claim_alerts(p_limit int) returns setof public.match_alerts
language sql volatile security definer set search_path = '' as $$
  update public.match_alerts set sent_at = now()
  where sent_at is null and created_at < now() - interval '30 minutes';

  with c as (
    select id from public.match_alerts
    where sent_at is null and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by id
    limit greatest(least(coalesce(p_limit, 50), 500), 0)
    for update skip locked
  )
  update public.match_alerts m set claimed_at = now()
  from c where m.id = c.id
  returning m.*;
$$;
revoke all on function public.claim_alerts(int) from public, anon, authenticated;
grant execute on function public.claim_alerts(int) to service_role;

-- Marks the given alerts delivered, after the push actually went out (service role, from the dispatch route).
create function public.mark_alerts_sent(p_ids bigint[]) returns void
language sql volatile security definer set search_path = '' as $$
  update public.match_alerts set sent_at = now() where id = any (p_ids) and sent_at is null;
$$;
revoke all on function public.mark_alerts_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_alerts_sent(bigint[]) to service_role;

-- ============================================================================================================
-- M2 — DM request enumeration of likely minors
-- ============================================================================================================
-- Refused requests are logged per requester so they count toward the daily cap; the count is taken under the lock
-- before any setting-specific decision, and the refusal is a single generic code (requests_blocked) for both
-- "setting closed" and "cap reached", so an attacker cannot tell a minor (team/QR-only) from a capped account.
create table private.dm_request_attempts (
  id          bigint generated always as identity primary key,
  opener      uuid not null,
  created_at  timestamptz not null default now()
);
create index dm_request_attempts_idx on private.dm_request_attempts (opener, created_at desc);
alter table private.dm_request_attempts enable row level security;  -- no policies: written by request_dm only
revoke all on private.dm_request_attempts from public, anon, authenticated;

-- The gate stays the boundary for a direct insert (defence in depth): reorder so the cap is counted first, and raise a
-- single generic code for both the closed setting and the cap. (The app opens requests through request_dm below, which
-- additionally counts refused attempts so an attacker cannot probe settings cheaply.)
create or replace function private.dm_thread_gate(p_me uuid, p_other uuid, p_qr boolean)
returns table (me_nick text, other_nick text, me_team text, other_team text)
language plpgsql security definer set search_path = '' as $$
declare
  setting text;
  mine record;
  lim int;
begin
  if p_me is null or p_me is distinct from auth.uid() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select p.nick, p.team_id, p.birth_date, p.created_at into mine from public.profiles p where p.user_id = p_me;
  if not found or not exists (select 1 from public.profiles p where p.user_id = p_other) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if private.is_banned(p_me) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if private.blocks_exist(p_me, p_other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if mine.birth_date is null then
    raise exception 'no_birth_date' using errcode = '42501';
  end if;
  if not coalesce(p_qr, false) then
    -- Count first, under the lock (a closed setting must not be a cheaper / different answer than a full cap).
    perform pg_advisory_xact_lock(hashtextextended('dm_open:' || p_me::text, 0));
    lim := case when mine.created_at > now() - interval '3 days' then 5 else 20 end;
    if (select count(*) from public.dm_threads t
         where t.opened_by = p_me and not t.via_qr and t.created_at > now() - interval '24 hours')
       + (select count(*) from private.dm_request_attempts a
           where a.opener = p_me and a.created_at > now() - interval '24 hours') >= lim then
      raise exception 'requests_blocked' using errcode = 'P0001';
    end if;
    setting := private.dm_setting(p_other);
    if setting = 'qr'
       or (setting = 'team' and not exists (select 1 from public.profiles p where p.user_id = p_other and p.team_id = mine.team_id)) then
      raise exception 'requests_blocked' using errcode = 'P0001';
    end if;
  end if;
  return query select mine.nick::text, p.nick::text, mine.team_id::text, p.team_id::text
                 from public.profiles p where p.user_id = p_other;
end $$;

-- The app opens a non-QR request through this function. Unlike a bare insert it can PERSIST a refused attempt (it
-- returns a status instead of raising, so the row survives the refusal), so refused attempts count toward the cap.
-- Banned / blocked / no-birth-date / self still raise (they are about the specific pair, not an enumeration oracle).
-- Returns the thread id on success, or null on a generic refusal.
create function public.request_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mine record;
  setting text;
  lim int;
  tid uuid;
  n int;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if p_other is null or p_other = me then
    raise exception 'self' using errcode = '22023';
  end if;
  -- An existing thread (a request or an accepted one): just return it, nothing counted.
  select t.id into tid from public.dm_threads t
   where t.user_a = least(me, p_other) and t.user_b = greatest(me, p_other);
  if found then
    return tid;
  end if;
  select p.nick, p.team_id, p.birth_date, p.created_at into mine from public.profiles p where p.user_id = me;
  if not found or not exists (select 1 from public.profiles p where p.user_id = p_other) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if private.is_banned(me) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if private.blocks_exist(me, p_other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if mine.birth_date is null then
    raise exception 'no_birth_date' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dm_open:' || me::text, 0));
  n := (select count(*) from public.dm_threads t
         where t.opened_by = me and not t.via_qr and t.created_at > now() - interval '24 hours')
     + (select count(*) from private.dm_request_attempts a
         where a.opener = me and a.created_at > now() - interval '24 hours');
  lim := case when mine.created_at > now() - interval '3 days' then 5 else 20 end;
  setting := private.dm_setting(p_other);
  if n >= lim
     or setting = 'qr'
     or (setting = 'team' and not exists (select 1 from public.profiles p where p.user_id = p_other and p.team_id = mine.team_id)) then
    -- Generic refusal: record the attempt (it counts toward the cap) and return null. No raise, so the row persists.
    insert into private.dm_request_attempts (opener) values (me);
    return null;
  end if;
  begin
    insert into public.dm_threads (user_a, user_b) values (least(me, p_other), greatest(me, p_other)) returning id into tid;
  exception when unique_violation then
    -- The other side opened it at the same moment: reuse that thread.
    select t.id into tid from public.dm_threads t
     where t.user_a = least(me, p_other) and t.user_b = greatest(me, p_other);
  end;
  return tid;
end $$;
revoke all on function public.request_dm(uuid) from public, anon;
grant execute on function public.request_dm(uuid) to authenticated;

-- ============================================================================================================
-- M3 — women-only rides: gender set once, and verified-female when the switch is on
-- ============================================================================================================
-- (1) Gender is set once. Engineering call: "set once" needs to compare the old and the new value, which an RLS
--     WITH CHECK cannot do (it only sees the new row), so it is enforced in the existing stamp trigger, exactly as the
--     team lock is. A fan may set gender while it is null; once it holds a value only an admin (admin_set_gender,
--     running as the function owner, not 'authenticated') may change it. Every other profile update is untouched.
create or replace function private.profiles_ride_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.adult_confirmed_at := case when new.adult_confirmed_at is not null then now() end;
    new.ride_safety_seen_at := case when new.ride_safety_seen_at is not null then now() end;
    return new;
  end if;
  -- Set once: a fan cannot change a gender that already holds a value (an admin RPC runs as the owner, so it may).
  if new.gender is distinct from old.gender and old.gender is not null
     and current_user in ('anon', 'authenticated') then
    raise exception 'gender_locked' using errcode = '42501';
  end if;
  if new.adult_confirmed_at is distinct from old.adult_confirmed_at then
    new.adult_confirmed_at := coalesce(old.adult_confirmed_at, case when new.adult_confirmed_at is not null then now() end);
  end if;
  if new.ride_safety_seen_at is distinct from old.ride_safety_seen_at then
    new.ride_safety_seen_at := coalesce(old.ride_safety_seen_at, case when new.ride_safety_seen_at is not null then now() end);
  end if;
  return new;
end $$;

alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('remove', 'ban', 'unban', 'status', 'auto_hide', 'restore', 'ride_suspend', 'ride_unsuspend',
                    'verify_reset', 'birth_date_fix', 'incident_ack', 'incident_close', 'gender_fix'));

create function public.admin_set_gender(p_user uuid, p_gender text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_gender is null or p_gender not in ('m', 'f', 'x') then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  update public.profiles set gender = p_gender where user_id = p_user;  -- allowed: the trigger sees current_user = owner
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (admin_id, action, target_user, note) values (auth.uid(), 'gender_fix', p_user, '');
end $$;
revoke all on function public.admin_set_gender(uuid, text) from public, anon;
grant execute on function public.admin_set_gender(uuid, text) to authenticated;

-- (2) Document-sex marker: a boolean on the identity verification. Chosen so no raw document, number, face or birth
--     date is kept — only "is this fan female by the document". null = the provider did not report sex. The current
--     provider does not return sex yet; verification_result leaves it null and the gate falls back to the set-once
--     gender (see the TODO in ride_female_ok). Populate it from verification_result once the real provider is wired.
alter table public.fan_verifications add column is_female boolean;

-- May this fan take part in a women-only ride?
--  - switch OFF (production today): the unchanged self-declared gender = 'f' check (honest users see no difference now).
--  - switch ON: an approved identity AND the fan counts as female — by the document-sex marker when the provider
--    reported it, otherwise (TODO: until the real provider returns sex) by the set-once gender.
create function private.ride_female_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not private.setting_on('rides_require_verification')
      then exists (select 1 from public.profiles p where p.user_id = p_user and p.gender = 'f')
    else private.verified(p_user, 'identity')
         and coalesce(
               (select bool_or(v.is_female) from public.fan_verifications v
                 where v.user_id = p_user and v.kind = 'identity' and v.status = 'approved'
                   and v.expires_at > now() and v.is_female is not null),
               -- TODO(provider-sex): switch to the is_female marker only, once the real provider returns document sex.
               exists (select 1 from public.profiles p where p.user_id = p_user and p.gender = 'f'))
  end
$$;
revoke all on function private.ride_female_ok(uuid) from public, anon;
grant execute on function private.ride_female_ok(uuid) to authenticated, service_role;

-- The ride gates now ask ride_female_ok instead of the bare gender check (identical when the switch is off).
create or replace function private.trips_ride_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_missing text;
begin
  if auth.uid() is null then
    return new;
  end if;
  perform private.ride_gate(new.user_id);
  if new.women_only and not private.ride_female_ok(new.user_id) then
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
       and not private.ride_female_ok(new.user_id) then
      raise exception 'women_only' using errcode = '42501';
    end if;
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

-- ============================================================================================================
-- M4 — per-fan upload cap (orphan cleanup lives in scripts/cleanup-clips.ts)
-- ============================================================================================================
-- Cap: 300 objects per fan per bucket in clips / stand / market. With the per-file size limits (50 / 15 / 10 MB) this
-- bounds a fan's storage without summing bytes on every insert (a count is cheap and index-friendly; a byte-sum is
-- not). Enforced by a BEFORE INSERT trigger so it holds for every writer, alongside the own-folder policies.
create function private.storage_upload_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_folder text;
begin
  if new.bucket_id not in ('clips', 'stand', 'market') then
    return new;
  end if;
  owner_folder := (storage.foldername(new.name))[1];
  -- Count the fan's objects by a name-prefix RANGE ('<owner>/' .. '<owner>0'), so it uses the existing
  -- storage.objects (bucket_id, name) index instead of scanning the bucket and filtering on a function expression.
  if (select count(*) from storage.objects o
       where o.bucket_id = new.bucket_id
         and o.name >= owner_folder || '/'
         and o.name <  owner_folder || '0') >= 300 then
    raise exception 'upload_cap' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.storage_upload_cap() from public, anon, authenticated;
create trigger zz_upload_cap before insert on storage.objects
  for each row execute function private.storage_upload_cap();

-- Orphans: files in the clips bucket with no matching clips row, older than an hour (a failed upload, or a row that
-- never got written). scripts/cleanup-clips.ts deletes them with the service key. Service role only.
create function public.orphan_clip_objects(p_limit int default 500) returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name::text from storage.objects o
   where o.bucket_id = 'clips' and o.created_at < now() - interval '1 hour'
     and not exists (select 1 from public.clips c where c.media_path = o.name)
   order by o.created_at
   limit greatest(least(coalesce(p_limit, 500), 1000), 1)
$$;
revoke all on function public.orphan_clip_objects(int) from public, anon, authenticated;
grant execute on function public.orphan_clip_objects(int) to service_role;

-- ============================================================================================================
-- M5 + L2 — group invite spam and block disclosure
-- ============================================================================================================
-- Caps: at most 5 new groups per creator per day, and 30 invites per inviter per day. A fan who declined or was removed
-- from a group is not re-invited for 24 hours. A block with a group member is a SILENT skip (never a distinct error),
-- so an admin cannot learn that two other fans have a block between them.
create table private.group_rate (
  id      bigint generated always as identity primary key,
  actor   uuid not null,
  kind    text not null check (kind in ('create', 'invite')),
  at      timestamptz not null default now()
);
create index group_rate_idx on private.group_rate (actor, kind, at desc);
alter table private.group_rate enable row level security;  -- no policies: written by the group RPCs only
revoke all on private.group_rate from public, anon, authenticated;

create table private.group_invite_cooldown (
  group_id  uuid not null,
  user_id   uuid not null,
  at        timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table private.group_invite_cooldown enable row level security;  -- no policies: written by the group RPCs only
revoke all on private.group_invite_cooldown from public, anon, authenticated;

-- Replaces 20261016100000_league_dms: adds the per-inviter daily cap, the re-invite cooldown, and a generic (silent)
-- skip for a block with any member (L2: an admin never learns of a block between two other fans).
create or replace function public.invite_to_group(p_group uuid, p_members uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g record;
  picked uuid[];
  x uuid;
begin
  if public.dm_group_lock(p_group) <> 'admin' then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select * into g from public.dm_groups where id = p_group;
  picked := array(select distinct u from unnest(p_members) u where u is not null and u <> me);
  if cardinality(picked) = 0 then
    raise exception 'no_members' using errcode = 'P0001';
  end if;
  if cardinality(picked) > 19 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  delete from public.dm_group_members
   where group_id = p_group and role = 'invited' and invited_at <= now() - interval '7 days';
  -- Skip fans already in the group.
  picked := array(select u from unnest(picked) u
                  where not exists (select 1 from public.dm_group_members m where m.group_id = p_group and m.user_id = u));
  -- L2: silently skip a fan with a block to/from any member (no distinct error that would reveal the block).
  picked := array(select u from unnest(picked) u
                  where not exists (select 1 from public.dm_group_members m
                                     where m.group_id = p_group and public.blocked_between(u, m.user_id)));
  -- M5: a fan who declined or was removed from this group is on cooldown for 24 hours.
  picked := array(select u from unnest(picked) u
                  where not exists (select 1 from private.group_invite_cooldown c
                                     where c.group_id = p_group and c.user_id = u and c.at > now() - interval '24 hours'));
  if cardinality(picked) = 0 then
    return picked;  -- nothing to do (all skipped): not an error, nothing revealed
  end if;
  -- M5: at most 30 invites per inviter per day (counts refused/added alike, pruned on read elsewhere).
  perform pg_advisory_xact_lock(hashtextextended('grp_invite:' || me::text, 0));
  if (select count(*) from private.group_rate r
       where r.actor = me and r.kind = 'invite' and r.at > now() - interval '24 hours') + cardinality(picked) > 30 then
    raise exception 'invite_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dm_group_members m where m.group_id = p_group) + cardinality(picked) > 20 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  foreach x in array picked loop
    if not exists (select 1 from public.profiles p where p.user_id = x and p.team_id = g.team_id) then
      raise exception 'not_same_team' using errcode = 'P0001';
    end if;
    if private.dm_setting(x) = 'qr'
       and not exists (select 1 from public.dm_threads t where t.user_a = least(me, x) and t.user_b = greatest(me, x)) then
      raise exception 'invites_closed' using errcode = 'P0001';
    end if;
    insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at)
    values (p_group, x, 'invited', me, now());
    insert into private.group_rate (actor, kind) values (me, 'invite');
    perform realtime.send(jsonb_build_object('group_id', p_group), 'invite', 'inbox:' || x, true);
  end loop;
  return picked;
end $$;
revoke all on function public.invite_to_group(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_group(uuid, uuid[]) to authenticated;

-- Replaces 20261013100000_dm_groups: adds the per-creator daily cap on new groups.
create or replace function public.create_group(p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  team text := public.my_team();
  n text := public.dm_group_name(p_name);
  gid uuid;
begin
  if me is null or team is null then
    raise exception 'not_same_team' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('grp_create:' || me::text, 0));
  if (select count(*) from private.group_rate r
       where r.actor = me and r.kind = 'create' and r.at > now() - interval '24 hours') >= 5 then
    raise exception 'group_limit' using errcode = 'P0001';
  end if;
  insert into public.dm_groups (team_id, name, created_by) values (team, n, me) returning id into gid;
  insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at, joined_at)
  values (gid, me, 'admin', me, now(), now());
  insert into private.group_rate (actor, kind) values (me, 'create');
  perform public.invite_to_group(gid, p_members);
  return gid;
end $$;
revoke all on function public.create_group(text, uuid[]) from public, anon;
grant execute on function public.create_group(text, uuid[]) to authenticated;

-- Record the cooldown when a fan declines an invite or is removed, so a re-invite waits 24 hours.
create or replace function public.answer_invite(p_group uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv record;
begin
  perform 1 from public.dm_groups where id = p_group for update;
  select * into inv from public.dm_group_members m where m.group_id = p_group and m.user_id = me and m.role = 'invited';
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if not coalesce(p_yes, false) then
    delete from public.dm_group_members where group_id = p_group and user_id = me;
    insert into private.group_invite_cooldown (group_id, user_id) values (p_group, me)
      on conflict (group_id, user_id) do update set at = now();
    return;
  end if;
  if inv.invited_at <= now() - interval '7 days' then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p join public.dm_groups g on g.team_id = p.team_id where p.user_id = me and g.id = p_group) then
    raise exception 'not_same_team' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.dm_group_members m where m.group_id = p_group and m.user_id <> me and public.blocked_between(me, m.user_id)) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  update public.dm_group_members set role = 'member', joined_at = now(), unread = 0 where group_id = p_group and user_id = me;
  insert into public.dm_group_events (group_id, kind, actor, subject) values (p_group, 'join', me, me);
end $$;
revoke all on function public.answer_invite(uuid, boolean) from public, anon;
grant execute on function public.answer_invite(uuid, boolean) to authenticated;

create or replace function public.remove_from_group(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r text;
begin
  if public.dm_group_lock(p_group) <> 'admin' then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_user = me then
    perform public.leave_group(p_group);
    return;
  end if;
  delete from public.dm_group_members where group_id = p_group and user_id = p_user returning role into r;
  if r is null then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  -- A removed fan (or a cancelled invite) is on re-invite cooldown for 24 hours (M5).
  insert into private.group_invite_cooldown (group_id, user_id) values (p_group, p_user)
    on conflict (group_id, user_id) do update set at = now();
  if r <> 'invited' then
    insert into public.dm_group_events (group_id, kind, actor, subject) values (p_group, 'remove', me, p_user);
  end if;
end $$;
revoke all on function public.remove_from_group(uuid, uuid) from public, anon;
grant execute on function public.remove_from_group(uuid, uuid) to authenticated;
