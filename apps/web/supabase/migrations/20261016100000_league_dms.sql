-- League-wide private messages, message requests, a personal QR code and the birth date
-- (spec docs/superpowers/specs/2026-10-16-league-dms-design.md, plan docs/superpowers/plans/2026-10-16-league-dms.md).
--
-- Engineering calls:
-- - The birth date comes with the profile at sign-up (the insert) or, for fans from before, once through
--   set_birth_date(). The database checks it on every write: not in the future, not before 1900-01-01, at least 16
--   (too_young). Fans cannot update it (no column grant); a change goes through support. Never readable by other fans:
--   profiles' select grant stays column-level without the three new columns; the fan reads them via my_private_profile().
-- - 18+ is derived from the birth date (private.is_adult) for rides and for the request default. A fan with no birth
--   date counts as a minor for the default (requests from their club only) and cannot open threads or rides
--   (no_birth_date) until they give it. adult_confirmed_at stays as a legacy column and no longer opens rides.
-- - The QR code is random (two v4 uuids, 43 url-safe characters), unique, stamped by the database on insert and on
--   reset; the fan never chooses it. It is a code, never the user id.
-- - A thread is a request while accepted_at is null. The opener may send one message; the other member's first
--   message, or accept_dm_thread(), accepts it. Rows are locked (thread row, for update), so two sends at the same
--   moment land one message. The pair is unique, so two fans opening at once get one thread.
-- - Threads opened through a QR code (open_dm_by_code, security definer) are accepted at once, outside the request
--   setting and the daily cap. The thread trigger is security invoker so it can tell a fan's direct insert
--   (current_user = authenticated: via_qr is forced false) from the definer function's insert.
-- - Daily cap on new requests: 20 per 24 h, 5 for an account younger than 3 days; one count at a time per fan
--   (advisory lock). QR threads are not counted.
-- - The most-blocked list is counted at read time over the last 30 days (blocks_created_idx): a rolling window cannot
--   be kept exact by a trigger without a scheduled job, and only admins read it.

-- ===================== 1. profile: birth date, request setting, QR code =====================
create function private.new_qr_code() returns text
language sql volatile set search_path = '' as $$
  select translate(rtrim(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_')
$$;
revoke all on function private.new_qr_code() from public, anon;
-- The column default runs as the inserting fan.
grant execute on function private.new_qr_code() to authenticated, service_role;

alter table public.profiles
  add column birth_date date,
  add column dm_requests text check (dm_requests in ('everyone', 'team', 'qr')),
  add column qr_code text not null default private.new_qr_code() check (qr_code ~ '^[A-Za-z0-9_-]{22,64}$');
create unique index profiles_qr_code_idx on public.profiles (qr_code);
-- Select stays column-level (20261015220000_ride_safety): the new columns are not in it, so no fan reads them.

create function private.check_birth_date(p_date date) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_date is null then
    return;
  end if;
  if p_date > current_date or p_date < date '1900-01-01' then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if p_date > (current_date - interval '16 years')::date then
    raise exception 'too_young' using errcode = '22023';
  end if;
end $$;
revoke all on function private.check_birth_date(date) from public, anon;
grant execute on function private.check_birth_date(date) to authenticated, service_role;

-- Invoker on purpose: it tells a fan's own write (current_user authenticated) from the database's.
create function private.profiles_private_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') or new.qr_code is null then
      new.qr_code := private.new_qr_code();
    end if;
    perform private.check_birth_date(new.birth_date);
  elsif new.birth_date is distinct from old.birth_date then
    perform private.check_birth_date(new.birth_date);
  end if;
  return new;
end $$;
revoke all on function private.profiles_private_stamp() from public, anon, authenticated;
create trigger profiles_private_stamp before insert or update on public.profiles
  for each row execute function private.profiles_private_stamp();
-- A fan's own sign-up must carry the birth date (rows from before keep null until the one-time prompt).
create policy profiles_insert_birth_date on public.profiles as restrictive for insert to authenticated
  with check (birth_date is not null);

create function private.is_adult(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.birth_date <= (current_date - interval '18 years')::date from public.profiles p where p.user_id = p_user), false)
$$;
revoke all on function private.is_adult(uuid) from public, anon, authenticated;

-- The fan's request setting, or the age default (18+ → everyone; 16–17 or no birth date → team).
create function private.dm_setting(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.dm_requests,
                  case when p.birth_date is not null and p.birth_date <= (current_date - interval '18 years')::date
                       then 'everyone' else 'team' end)
    from public.profiles p where p.user_id = p_user
$$;
revoke all on function private.dm_setting(uuid) from public, anon, authenticated;

create function public.set_birth_date(p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cur date;
begin
  if p_date is null then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  select p.birth_date into cur from public.profiles p where p.user_id = me for update;
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  if cur is not null then
    raise exception 'already_set' using errcode = 'P0001';
  end if;
  update public.profiles set birth_date = p_date where user_id = me;  -- checked by profiles_private_stamp
end $$;
revoke all on function public.set_birth_date(date) from public, anon;
grant execute on function public.set_birth_date(date) to authenticated;

create function public.set_dm_requests(p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_value is null or p_value not in ('everyone', 'team', 'qr') then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  update public.profiles set dm_requests = p_value where user_id = auth.uid();
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.set_dm_requests(text) from public, anon;
grant execute on function public.set_dm_requests(text) to authenticated;

-- The caller's own private fields; dm_requests is the setting in force (the stored one or the age default).
create function public.my_private_profile() returns table (birth_date date, dm_requests text, qr_code text)
language sql stable security definer set search_path = '' as $$
  select p.birth_date, private.dm_setting(p.user_id), p.qr_code from public.profiles p where p.user_id = auth.uid()
$$;
revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;

-- A new code; the old one stops working at once.
create function public.reset_qr_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  update public.profiles set qr_code = private.new_qr_code() where user_id = auth.uid() returning qr_code into v;
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  return v;
end $$;
revoke all on function public.reset_qr_code() from public, anon;
grant execute on function public.reset_qr_code() to authenticated;

-- ---------- 1b. rides read 18+ from the birth date ----------
create or replace function private.ride_gate(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.user_id = p_user and p.birth_date is not null) then
    raise exception 'no_birth_date' using errcode = '42501';
  end if;
  if not private.is_adult(p_user) then
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

-- adult_confirmed now means "18+ by the birth date".
create or replace function public.my_ride_profile()
returns table (gender text, adult_confirmed boolean, safety_seen boolean, ride_suspended boolean, phone_required boolean,
               phone_ok boolean)
language sql stable security definer set search_path = '' as $$
  select p.gender, private.is_adult(p.user_id), p.ride_safety_seen_at is not null, private.ride_suspended(p.user_id),
         private.setting_on('rides_require_phone'),
         exists (select 1 from auth.users u where u.id = p.user_id and u.phone_confirmed_at is not null)
    from public.profiles p
   where p.user_id = auth.uid()
$$;

-- The harm-report guard: "the reporter is 18+" now comes from the birth date (otherwise unchanged).
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
     or not exists (select 1 from public.trip_requests q join public.trips t on t.id = q.trip_id
                     where q.created_at > now() - interval '30 days'
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

-- ===================== 2. threads: league-wide, requests, caps, keys, bans =====================
alter table public.dm_threads
  add column accepted_at timestamptz,
  add column opened_by uuid,                 -- no foreign key: the thread goes with either member's account
  add column via_qr boolean not null default false,
  -- Both clubs, stamped (a club never changes): the inbox and the request card show the other fan's colours without
  -- reading profiles of another club.
  add column team_a text references public.teams (id),
  add column team_b text references public.teams (id);
-- Threads from before count as accepted: nothing changes for current fans.
update public.dm_threads t
   set accepted_at = coalesce(t.accepted_at, t.created_at),
       team_a = (select p.team_id from public.profiles p where p.user_id = t.user_a),
       team_b = (select p.team_id from public.profiles p where p.user_id = t.user_b);
-- The daily cap counts a fan's new requests.
create index dm_threads_opened_idx on public.dm_threads (opened_by, created_at desc) where not via_qr;

-- May I (the caller) read that fan's public device keys: a thread between us, a group we share, or the same club (as
-- before), and never across a block either way. The request setting is deliberately not a reason (security review
-- 2026-10-16): otherwise anyone could list every fan who takes requests from everyone. The opener of a new thread reads
-- the keys right after opening it (the thread exists by then).
create function private.can_dm(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_other is not null and (select auth.uid()) is not null and p_other <> (select auth.uid())
     and not private.blocks_exist((select auth.uid()), p_other)
     and (
       exists (select 1 from public.dm_threads t
                where t.user_a = least((select auth.uid()), p_other) and t.user_b = greatest((select auth.uid()), p_other))
       or exists (select 1 from public.dm_group_members a
                    join public.dm_group_members b on b.group_id = a.group_id and b.user_id = p_other
                   where a.user_id = (select auth.uid()))
       or exists (select 1 from public.profiles p where p.user_id = p_other and p.team_id = public.my_team())
     )
$$;
revoke all on function private.can_dm(uuid) from public, anon;
grant execute on function private.can_dm(uuid) to authenticated;  -- inside the device_keys policy only

-- Every rule for opening a thread; raises with a code, returns the two nicknames (the caller may not read the other's
-- profile across clubs). p_qr: opened through the other fan's code (setting and cap skipped).
create function private.dm_thread_gate(p_me uuid, p_other uuid, p_qr boolean)
returns table (me_nick text, other_nick text, me_team text, other_team text)
language plpgsql security definer set search_path = '' as $$
declare
  setting text;
  mine record;
  lim int;
begin
  -- Only for the caller themselves (the QR path is reached only through open_dm_by_code, which passes the caller).
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
    setting := private.dm_setting(p_other);
    if setting = 'qr'
       or (setting = 'team' and not exists (select 1 from public.profiles p where p.user_id = p_other and p.team_id = mine.team_id)) then
      raise exception 'requests_closed' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('dm_open:' || p_me::text, 0));
    lim := case when mine.created_at > now() - interval '3 days' then 5 else 20 end;
    if (select count(*) from public.dm_threads t
         where t.opened_by = p_me and not t.via_qr and t.created_at > now() - interval '24 hours') >= lim then
      raise exception 'rate_limit' using errcode = 'P0001';
    end if;
  end if;
  return query select mine.nick::text, p.nick::text, mine.team_id::text, p.team_id::text
                 from public.profiles p where p.user_id = p_other;
end $$;
revoke all on function private.dm_thread_gate(uuid, uuid, boolean) from public, anon;
grant execute on function private.dm_thread_gate(uuid, uuid, boolean) to authenticated;  -- from the invoker trigger

-- Replaces the P3 version (same club only). Security invoker: a fan's direct insert can never claim via_qr.
create or replace function public.dm_threads_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
  qr boolean;
  g record;
begin
  if me is null or me not in (new.user_a, new.user_b) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  other := case when me = new.user_a then new.user_b else new.user_a end;
  qr := coalesce(new.via_qr, false) and current_user not in ('anon', 'authenticated');
  select * into g from private.dm_thread_gate(me, other, qr);
  new.nick_a := case when me = new.user_a then g.me_nick else g.other_nick end;
  new.nick_b := case when me = new.user_b then g.me_nick else g.other_nick end;
  new.team_a := case when me = new.user_a then g.me_team else g.other_team end;
  new.team_b := case when me = new.user_b then g.me_team else g.other_team end;
  new.via_qr := qr;
  new.opened_by := me;
  new.accepted_at := case when qr then now() end;
  new.last_at := now();
  new.last_from := null;
  new.created_at := now();
  return new;
end $$;

-- Replaces the P3 version: adds the request rules (one message before acceptance; the other member's message accepts).
create or replace function public.dm_messages_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  other uuid;
begin
  -- Locked: two messages at the same moment are checked one after the other.
  select * into t from public.dm_threads where id = new.thread_id for update;
  if not found or new.sender_id not in (t.user_a, t.user_b) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  other := case when new.sender_id = t.user_a then t.user_b else t.user_a end;
  -- A suspended fan cannot write privately either (security review 2026-10-16; the text stays unreadable to us).
  if private.is_banned(new.sender_id) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if public.blocked_between(new.sender_id, other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if (select count(*) from jsonb_object_keys(new.wrapped_keys)) > 20 then
    raise exception 'too many devices' using errcode = '22023';
  end if;
  if t.accepted_at is null then
    if new.sender_id is not distinct from t.opened_by then
      if exists (select 1 from public.dm_messages m where m.thread_id = t.id and m.sender_id = new.sender_id) then
        raise exception 'awaiting_accept' using errcode = 'P0001';
      end if;
    else
      update public.dm_threads set accepted_at = now() where id = t.id;
    end if;
  end if;
  new.created_at := now();
  if (select count(*) from public.dm_messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- The recipient accepts a request (once; the opener cannot).
create function public.accept_dm_thread(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t record;
begin
  select * into t from public.dm_threads where id = p_thread for update;
  if not found or me is null or me not in (t.user_a, t.user_b) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if t.accepted_at is not null then
    return;
  end if;
  if me is not distinct from t.opened_by then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if private.blocks_exist(t.user_a, t.user_b) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  update public.dm_threads set accepted_at = now() where id = p_thread;
end $$;
revoke all on function public.accept_dm_thread(uuid) from public, anon;
grant execute on function public.accept_dm_thread(uuid) to authenticated;

-- Public keys: my own, or a fan I may reach (was: same club only).
drop policy device_keys_read on public.device_keys;
create policy device_keys_read on public.device_keys for select to authenticated
  using (user_id = (select auth.uid()) or private.can_dm(user_id));

-- ===================== 3. QR code and the most-blocked list =====================
-- Opens (or returns) the thread with the fan whose code was scanned, accepted. Skips their request setting and the
-- daily cap; never across a block, never for a banned fan or one without a birth date.
create function public.open_dm_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
  tid uuid;
begin
  if me is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select p.user_id into other from public.profiles p where p.qr_code = p_code;
  if not found then
    raise exception 'bad_code' using errcode = 'P0002';
  end if;
  if other = me then
    raise exception 'self' using errcode = '22023';
  end if;
  if private.is_banned(me) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if private.blocks_exist(me, other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = me and p.birth_date is not null) then
    raise exception 'no_birth_date' using errcode = '42501';
  end if;
  select t.id into tid from public.dm_threads t where t.user_a = least(me, other) and t.user_b = greatest(me, other) for update;
  if found then
    update public.dm_threads set accepted_at = coalesce(accepted_at, now()) where id = tid;
    return tid;
  end if;
  begin
    insert into public.dm_threads (user_a, user_b, via_qr) values (least(me, other), greatest(me, other), true) returning id into tid;
  exception when unique_violation then
    -- Opened by the other side at the same moment: use that one, accepted.
    update public.dm_threads set accepted_at = coalesce(accepted_at, now())
     where user_a = least(me, other) and user_b = greatest(me, other)
    returning id into tid;
  end;
  return tid;
end $$;
revoke all on function public.open_dm_by_code(text) from public, anon;
grant execute on function public.open_dm_by_code(text) to authenticated;

-- The fan's card on /add/<code>: nickname and club only.
create function public.qr_card(p_code text) returns table (nick text, team_id text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query select p.nick::text, p.team_id::text from public.profiles p where p.qr_code = p_code;
  if not found then
    raise exception 'bad_code' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.qr_card(text) from public, anon;
grant execute on function public.qr_card(text) to authenticated;

-- Fans blocked by many distinct fans in the last 30 days (no content, counts only), for the admins.
create index blocks_created_idx on public.blocks (created_at desc);
create function public.admin_most_blocked(p_limit int default 20)
returns table (user_id uuid, nick text, blocked_by int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select b.blocked_id, coalesce(p.nick::text, ''), count(*)::int
      from public.blocks b
      left join public.profiles p on p.user_id = b.blocked_id
     where b.created_at > now() - interval '30 days'
     group by b.blocked_id, p.nick
     order by count(*) desc, b.blocked_id
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;
revoke all on function public.admin_most_blocked(int) from public, anon;
grant execute on function public.admin_most_blocked(int) to authenticated;

-- ---------- group invites respect a QR-only setting (security review 2026-10-16) ----------
-- Same rules as 20261013110000_dm_groups_blocks, plus: a fan whose setting in force is 'qr' is invited only by a fan
-- who already has a private thread with them (invites_closed).
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
  picked := array(select u from unnest(picked) u
                  where not exists (select 1 from public.dm_group_members m where m.group_id = p_group and m.user_id = u));
  if (select count(*) from public.dm_group_members m where m.group_id = p_group) + cardinality(picked) > 20 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  foreach x in array picked loop
    if not exists (select 1 from public.profiles p where p.user_id = x and p.team_id = g.team_id) then
      raise exception 'not_same_team' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.dm_group_members m where m.group_id = p_group and public.blocked_between(x, m.user_id)) then
      raise exception 'blocked' using errcode = 'P0001';
    end if;
    if private.dm_setting(x) = 'qr'
       and not exists (select 1 from public.dm_threads t where t.user_a = least(me, x) and t.user_b = greatest(me, x)) then
      raise exception 'invites_closed' using errcode = 'P0001';
    end if;
    insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at)
    values (p_group, x, 'invited', me, now());
    perform realtime.send(jsonb_build_object('group_id', p_group), 'invite', 'inbox:' || x, true);
  end loop;
  return picked;
end $$;
revoke all on function public.invite_to_group(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_group(uuid, uuid[]) to authenticated;
