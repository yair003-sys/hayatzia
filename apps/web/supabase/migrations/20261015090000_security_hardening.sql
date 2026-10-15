-- Security review, 2026-10-15 (owner asked for an attacker's-eye review). Fixes, each covered in tests/security.test.sql:
-- 1. Message notifications only for a real, fresh message, never across a block, at most one per 10 s per conversation.
-- 2. A fan's join date is stamped by the database (it set the "fan #N" number on the card).
-- 3. Anonymous sign-ins can never create a fan profile.
-- 4. blocked_between answers a fan only about themselves (it could reveal who blocked whom among other fans).
-- 5. Logged-out visitors can run no database function except the one public lookup (club_of_api); new functions
--    start closed to them.
-- 6. View-once posts: the file is readable only through the server, which records the view first.
-- 7. A size cap on private-message keys (groups had one already).
-- 8. Two riders accepted at the same moment can no longer exceed the seats of a trip.
-- 9. At most 10 notification subscriptions per fan (the oldest goes), so one fan cannot flood the goal alerts.

-- ---------- 1. message notifications ----------
create table public.push_throttle (
  user_id  uuid not null references auth.users (id) on delete cascade,
  scope    text not null check (char_length(scope) < 60),
  at       timestamptz not null,
  primary key (user_id, scope)
);
alter table public.push_throttle enable row level security;
revoke all on public.push_throttle from anon, authenticated;

-- True once per real message burst: the caller sent a message in that conversation in the last minute, no block exists
-- either way (private chats), and the caller was not already told "yes" for it in the last 10 seconds.
create function public.claim_message_push(p_kind text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ok boolean;
begin
  if me is null or p_id is null then
    return false;
  end if;
  if p_kind = 'dm' then
    if not exists (select 1 from public.dm_messages m
                    where m.sender_id = me and m.thread_id = p_id and m.created_at > now() - interval '1 minute') then
      return false;
    end if;
    if exists (select 1 from public.dm_threads t where t.id = p_id and public.blocked_between(t.user_a, t.user_b)) then
      return false;
    end if;
  elsif p_kind = 'grp' then
    if not exists (select 1 from public.dm_group_messages m
                    where m.sender_id = me and m.group_id = p_id and m.created_at > now() - interval '1 minute') then
      return false;
    end if;
  else
    return false;
  end if;
  insert into public.push_throttle as p (user_id, scope, at) values (me, p_kind || ':' || p_id, now())
  on conflict (user_id, scope) do update set at = excluded.at where p.at < now() - interval '10 seconds'
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.claim_message_push(text, uuid) from public, anon;
grant execute on function public.claim_message_push(text, uuid) to authenticated;

-- ---------- 2. join date ----------
create function public.profiles_stamp_created() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at := now();
  end if;
  return new;
end $$;
create trigger profiles_stamp_created before insert on public.profiles
  for each row execute function public.profiles_stamp_created();
revoke all on function public.profiles_stamp_created() from public, anon, authenticated;

-- ---------- 3. no profile for anonymous sign-ins ----------
create policy profiles_insert_not_anonymous on public.profiles as restrictive for insert to authenticated
  with check (not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

-- ---------- 4. blocked_between ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create function private.blocks_exist(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks k
                  where (k.user_id = a and k.blocked_id = b) or (k.user_id = b and k.blocked_id = a))
$$;
revoke all on function private.blocks_exist(uuid, uuid) from public, anon;
grant execute on function private.blocks_exist(uuid, uuid) to authenticated, service_role;

-- Inside the database's own functions (they run as their owner) it answers for any two fans. Called by a fan (an API
-- call or a row rule), it answers only about the fan themselves; about two other fans it says false.
create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case
    when current_user = 'authenticated' and (select auth.uid()) is distinct from a and (select auth.uid()) is distinct from b
      then false
    else private.blocks_exist(a, b)
  end
$$;

-- ---------- 5. functions closed to logged-out visitors ----------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname <> 'club_of_api' and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')  -- extensions keep theirs
  loop
    execute format('revoke execute on function %s from anon', f.sig);
    -- PUBLIC holds execute by default; take it away too, keeping the explicit grant to signed-in fans.
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
-- New functions get EXECUTE for PUBLIC by Postgres itself; tests/security.test.sql fails CI on any new one anon can run.

-- ---------- 6. view-once files ----------
drop policy clips_files_read on storage.objects;
create policy clips_files_read on storage.objects for select to authenticated using (
  bucket_id = 'clips'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (select 1 from public.clips c where c.media_path = name and not c.once)
  )
);

-- ---------- 7. private-message key size ----------
alter table public.dm_messages
  add constraint dm_messages_wrapped_keys_size check (pg_column_size(wrapped_keys) < 16000);

-- ---------- 8. seats ----------
create or replace function public.trip_requests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  if tg_op = 'INSERT' then
    select * into t from public.trips where id = new.trip_id;
    new.status := 'pending';
    if t.user_id = new.user_id then
      raise exception 'own trip' using errcode = '42501';
    end if;
    return new;
  end if;
  -- The trip row is locked, so two accepts at the same moment are counted one after the other.
  select * into t from public.trips where id = new.trip_id for update;
  if t.user_id <> auth.uid() then
    raise exception 'only the driver decides' using errcode = '42501';
  end if;
  if new.status = 'accepted' and old.status <> 'accepted' and t.kind = 'offer'
     and (select count(*) from public.trip_requests r where r.trip_id = new.trip_id and r.status = 'accepted') >= t.seats then
    raise exception 'trip_full' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 9. subscriptions per fan ----------
create function public.push_subscriptions_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_subscriptions s
   where s.user_id = new.user_id
     and s.id not in (select k.id from public.push_subscriptions k where k.user_id = new.user_id
                       order by k.created_at desc, k.id desc limit 10);
  return null;
end $$;
create trigger push_subscriptions_cap after insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_cap();
revoke all on function public.push_subscriptions_cap() from public, anon, authenticated;
