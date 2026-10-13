-- Messages like Telegram: small invite-only end-to-end encrypted groups, unread counters and previews.
-- Groups: same club only, at most 20 fans including pending invites, the admin invites/removes/renames, anyone leaves,
-- invites expire after 7 days and joining needs the invited fan's yes. The server stores ciphertext only.
-- Groups and memberships change only through the security-definer RPCs below (no direct writes).

-- ---------- 1:1 threads: preview pointer and unread counters ----------
alter table public.dm_threads
  add column last_message_id uuid,
  add column unread_a int not null default 0,
  add column unread_b int not null default 0;

-- Replaces the P3 version: also points at the last message and counts unread for the other side.
create or replace function public.dm_messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  update public.dm_threads
     set last_at = new.created_at,
         last_from = new.sender_id,
         last_message_id = new.id,
         unread_a = unread_a + case when new.sender_id = user_b then 1 else 0 end,
         unread_b = unread_b + case when new.sender_id = user_a then 1 else 0 end
   where id = new.thread_id
  returning user_a, user_b into t;
  perform realtime.broadcast_changes('dm:' || new.thread_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, null);
  perform realtime.send(jsonb_build_object('thread_id', new.thread_id, 'from', new.sender_id), 'message', 'inbox:' || t.user_a, true);
  perform realtime.send(jsonb_build_object('thread_id', new.thread_id, 'from', new.sender_id), 'message', 'inbox:' || t.user_b, true);
  return null;
end $$;

-- ---------- groups ----------
create table public.dm_groups (
  id               uuid primary key default gen_random_uuid(),
  team_id          text not null references public.teams (id),
  name             varchar(40) not null check (char_length(name) between 2 and 40),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_at          timestamptz not null default now(),
  last_from        uuid,
  last_message_id  uuid,
  members_count    int not null default 0
);
create index dm_groups_team_idx on public.dm_groups (team_id);

create table public.dm_group_members (
  group_id    uuid not null references public.dm_groups (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin', 'member', 'invited')),
  invited_by  uuid references auth.users (id) on delete set null,
  invited_at  timestamptz not null default now(),
  joined_at   timestamptz,
  unread      int not null default 0,
  muted       boolean not null default false,
  primary key (group_id, user_id),
  check ((role = 'invited') = (joined_at is null))
);
create index dm_group_members_user_idx on public.dm_group_members (user_id, group_id);

create table public.dm_group_messages (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.dm_groups (id) on delete cascade,
  sender_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_device  varchar(40) not null,
  iv             varchar(40) not null,
  ciphertext     text not null check (char_length(ciphertext) < 4000),
  wrapped_keys   jsonb not null check (jsonb_typeof(wrapped_keys) = 'object'),
  created_at     timestamptz not null default now()
);
create index dm_group_messages_group_idx on public.dm_group_messages (group_id, created_at desc, id desc);
create index dm_group_messages_sender_idx on public.dm_group_messages (sender_id, created_at desc);

-- System lines (join/leave/remove/rename): ids only, no content.
create table public.dm_group_events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.dm_groups (id) on delete cascade,
  kind        text not null check (kind in ('join', 'leave', 'remove', 'rename')),
  actor       uuid references auth.users (id) on delete set null,
  subject     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index dm_group_events_group_idx on public.dm_group_events (group_id, created_at);

-- Groups the caller belongs to (admin/member), optionally with live (not expired) invites. Used by the RLS policies;
-- security definer so the members policy does not recurse into itself.
create function public.my_groups(with_invites boolean) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.group_id from public.dm_group_members m
  where m.user_id = auth.uid()
    and (m.role <> 'invited' or (with_invites and m.invited_at > now() - interval '7 days'))
$$;
revoke all on function public.my_groups(boolean) from public, anon;
grant execute on function public.my_groups(boolean) to authenticated;

-- Membership invariants, whatever deleted the row (an RPC or a deleted account):
-- members_count = admins + members; the earliest-joined member takes over from the last admin; an empty group is deleted.
create function public.dm_group_members_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  g uuid := coalesce(new.group_id, old.group_id);
begin
  if tg_op = 'DELETE' and old.role in ('admin', 'member') then
    if not exists (select 1 from public.dm_group_members m where m.group_id = g and m.role in ('admin', 'member')) then
      delete from public.dm_groups where id = g;
      return null;
    end if;
    if old.role = 'admin' and not exists (select 1 from public.dm_group_members m where m.group_id = g and m.role = 'admin') then
      update public.dm_group_members set role = 'admin'
       where group_id = g and user_id = (
         select m.user_id from public.dm_group_members m
          where m.group_id = g and m.role = 'member' order by m.joined_at, m.user_id limit 1);
    end if;
  end if;
  update public.dm_groups
     set members_count = (select count(*) from public.dm_group_members m where m.group_id = g and m.role in ('admin', 'member'))
   where id = g;
  return null;
end $$;
create trigger dm_group_members_after after insert or delete or update of role on public.dm_group_members
  for each row execute function public.dm_group_members_after();

-- Insert only by a current member; stamps the sender and time; same rate limit as private messages.
create function public.dm_group_messages_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.sender_id := auth.uid();
  if new.sender_id is null or not exists (
    select 1 from public.dm_group_members m
    where m.group_id = new.group_id and m.user_id = new.sender_id and m.role in ('admin', 'member')
  ) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if (select count(*) from jsonb_object_keys(new.wrapped_keys)) > 60 then
    raise exception 'too many devices' using errcode = '22023';
  end if;
  new.created_at := now();
  if (select count(*) from public.dm_group_messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger dm_group_messages_stamp before insert on public.dm_group_messages for each row execute function public.dm_group_messages_stamp();

-- After a message: bump the group, count unread for the other members (not for one who blocked the sender),
-- broadcast on the group channel and ping each member's inbox. Ids only, never content beyond the ciphertext row.
create function public.dm_group_messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  update public.dm_groups set last_at = new.created_at, last_from = new.sender_id, last_message_id = new.id where id = new.group_id;
  update public.dm_group_members m set unread = m.unread + 1
   where m.group_id = new.group_id and m.role in ('admin', 'member') and m.user_id <> new.sender_id
     and not exists (select 1 from public.blocks k where k.user_id = m.user_id and k.blocked_id = new.sender_id);
  perform realtime.broadcast_changes('grp:' || new.group_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, null);
  for r in
    select m.user_id from public.dm_group_members m
     where m.group_id = new.group_id and m.role in ('admin', 'member')
       and not exists (select 1 from public.blocks k where k.user_id = m.user_id and k.blocked_id = new.sender_id)
  loop
    perform realtime.send(jsonb_build_object('group_id', new.group_id, 'from', new.sender_id), 'message', 'inbox:' || r.user_id, true);
  end loop;
  return null;
end $$;
create trigger dm_group_messages_after after insert on public.dm_group_messages for each row execute function public.dm_group_messages_after();

-- ---------- RPCs (the only way to change groups and memberships) ----------

-- Locks the group and returns the caller's role in it ('admin' | 'member'); raises not_member otherwise.
create function public.dm_group_lock(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r text;
begin
  perform 1 from public.dm_groups where id = p_group for update;
  select m.role into r from public.dm_group_members m where m.group_id = p_group and m.user_id = auth.uid();
  if r is null or r = 'invited' then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  return r;
end $$;
revoke all on function public.dm_group_lock(uuid) from public, anon, authenticated;

create function public.dm_group_name(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) not between 2 and 40 then
    raise exception 'bad_name' using errcode = 'P0001';
  end if;
  return n;
end $$;
revoke all on function public.dm_group_name(text) from public, anon, authenticated;

-- Invites 1–19 fans of the group's club. Total incl. live invites ≤ 20; no block between an invitee and anyone in
-- the group (members and invitees); fans already in the group are skipped. Expired invites are purged first.
create function public.invite_to_group(p_group uuid, p_members uuid[]) returns void
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
    insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at)
    values (p_group, x, 'invited', me, now());
    perform realtime.send(jsonb_build_object('group_id', p_group), 'invite', 'inbox:' || x, true);
  end loop;
end $$;
revoke all on function public.invite_to_group(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_group(uuid, uuid[]) to authenticated;

-- Opens a group in the caller's club; the caller is its admin and the picked fans are invited.
create function public.create_group(p_name text, p_members uuid[]) returns uuid
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
  insert into public.dm_groups (team_id, name, created_by) values (team, n, me) returning id into gid;
  insert into public.dm_group_members (group_id, user_id, role, invited_by, invited_at, joined_at)
  values (gid, me, 'admin', me, now(), now());
  perform public.invite_to_group(gid, p_members);
  return gid;
end $$;
revoke all on function public.create_group(text, uuid[]) from public, anon;
grant execute on function public.create_group(text, uuid[]) to authenticated;

-- Yes: a live invite becomes a membership from now (rechecks club and blocks). No: the invite is deleted.
-- An expired invite raises invite_expired (it is hidden by RLS and purged by the next invite to the group).
create function public.answer_invite(p_group uuid, p_yes boolean) returns void
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

-- Admin only: removes a member (or cancels a pending invite). Removing oneself is leaving.
create function public.remove_from_group(p_group uuid, p_user uuid) returns void
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
  if r <> 'invited' then
    insert into public.dm_group_events (group_id, kind, actor, subject) values (p_group, 'remove', me, p_user);
  end if;
end $$;
revoke all on function public.remove_from_group(uuid, uuid) from public, anon;
grant execute on function public.remove_from_group(uuid, uuid) to authenticated;

-- Anyone leaves (an invitee leaving = declining). Admin hand-over and deleting an empty group: dm_group_members_after.
create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r text;
begin
  perform 1 from public.dm_groups where id = p_group for update;
  select m.role into r from public.dm_group_members m where m.group_id = p_group and m.user_id = me;
  if r is null then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if r <> 'invited' then
    insert into public.dm_group_events (group_id, kind, actor, subject) values (p_group, 'leave', me, me);
  end if;
  delete from public.dm_group_members where group_id = p_group and user_id = me;
end $$;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

create function public.rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n text := public.dm_group_name(p_name);
begin
  if public.dm_group_lock(p_group) <> 'admin' then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  update public.dm_groups set name = n where id = p_group;
  insert into public.dm_group_events (group_id, kind, actor) values (p_group, 'rename', auth.uid());
end $$;
revoke all on function public.rename_group(uuid, text) from public, anon;
grant execute on function public.rename_group(uuid, text) to authenticated;

create function public.mute_group(p_group uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.dm_group_members set muted = coalesce(p_muted, false)
   where group_id = p_group and user_id = auth.uid() and role in ('admin', 'member');
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.mute_group(uuid, boolean) from public, anon;
grant execute on function public.mute_group(uuid, boolean) to authenticated;

-- Zeroes the caller's unread counter of a thread ('dm') or a group ('group').
create function public.mark_read(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if p_kind = 'dm' then
    update public.dm_threads
       set unread_a = case when user_a = me then 0 else unread_a end,
           unread_b = case when user_b = me then 0 else unread_b end
     where id = p_id and me in (user_a, user_b);
  elsif p_kind = 'group' then
    update public.dm_group_members set unread = 0
     where group_id = p_id and user_id = me and role in ('admin', 'member');
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if not found then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.mark_read(text, uuid) from public, anon;
grant execute on function public.mark_read(text, uuid) to authenticated;

-- ---------- RLS and grants ----------
alter table public.dm_groups enable row level security;
alter table public.dm_group_members enable row level security;
alter table public.dm_group_messages enable row level security;
alter table public.dm_group_events enable row level security;

-- Members see their groups; invitees see the group of a live invite (name, count).
create policy dm_groups_read on public.dm_groups for select to authenticated
  using (id in (select public.my_groups(true)));
-- Members see the group's rows; an invitee sees only their own live invite. Expired invites are hidden.
create policy dm_group_members_read on public.dm_group_members for select to authenticated
  using ((role <> 'invited' or invited_at > now() - interval '7 days')
         and (user_id = (select auth.uid()) or group_id in (select public.my_groups(false))));
-- Members read what was sent since they joined, except from a fan they blocked.
create policy dm_group_messages_read on public.dm_group_messages for select to authenticated
  using (
    exists (select 1 from public.dm_group_members m
            where m.group_id = dm_group_messages.group_id and m.user_id = (select auth.uid())
              and m.role in ('admin', 'member') and dm_group_messages.created_at >= m.joined_at)
    and not exists (select 1 from public.blocks k where k.user_id = (select auth.uid()) and k.blocked_id = dm_group_messages.sender_id)
  );
create policy dm_group_messages_insert_self on public.dm_group_messages for insert to authenticated
  with check (sender_id = (select auth.uid()));
create policy dm_group_events_read on public.dm_group_events for select to authenticated
  using (exists (select 1 from public.dm_group_members m
                 where m.group_id = dm_group_events.group_id and m.user_id = (select auth.uid())
                   and m.role in ('admin', 'member') and dm_group_events.created_at >= m.joined_at));

revoke all on public.dm_groups, public.dm_group_members, public.dm_group_messages, public.dm_group_events from anon, authenticated;
grant select on public.dm_groups, public.dm_group_members, public.dm_group_messages, public.dm_group_events to authenticated;
grant insert (group_id, sender_device, iv, ciphertext, wrapped_keys) on public.dm_group_messages to authenticated;

-- ---------- realtime: thread, group and inbox channels ----------
drop policy dm_channel_receive on realtime.messages;
create policy dm_channel_receive on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and (
    realtime.topic() = 'inbox:' || (select auth.uid())::text
    or exists (
      select 1 from public.dm_threads t
      where realtime.topic() = 'dm:' || t.id and (select auth.uid()) in (t.user_a, t.user_b)
    )
    or exists (
      select 1 from public.dm_group_members m
      where m.user_id = (select auth.uid()) and m.role in ('admin', 'member') and realtime.topic() = 'grp:' || m.group_id
    )
  )
);
