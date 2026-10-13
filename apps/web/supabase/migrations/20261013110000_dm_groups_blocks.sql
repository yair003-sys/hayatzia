-- Groups, second pass (after 20261013100000_dm_groups, already applied on staging):
-- 1. Blocks count both ways inside a group, like in private messages: a fan never reads, counts or is pinged about
--    messages from a fan they blocked or who blocked them (blocked_between).
-- 2. A size cap on a group message's wrapped keys.
-- 3. invite_to_group returns the fans it actually invited (so the app notifies only them).
-- 4. group_push_targets: who to notify about a new group message (non-muted members, no block either way).

-- ---------- 1. symmetric blocks ----------
create or replace function public.dm_group_messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  update public.dm_groups set last_at = new.created_at, last_from = new.sender_id, last_message_id = new.id where id = new.group_id;
  update public.dm_group_members m set unread = m.unread + 1
   where m.group_id = new.group_id and m.role in ('admin', 'member') and m.user_id <> new.sender_id
     and not public.blocked_between(m.user_id, new.sender_id);
  perform realtime.broadcast_changes('grp:' || new.group_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, null);
  for r in
    select m.user_id from public.dm_group_members m
     where m.group_id = new.group_id and m.role in ('admin', 'member')
       and (m.user_id = new.sender_id or not public.blocked_between(m.user_id, new.sender_id))
  loop
    perform realtime.send(jsonb_build_object('group_id', new.group_id, 'from', new.sender_id), 'message', 'inbox:' || r.user_id, true);
  end loop;
  return null;
end $$;

-- Members read what was sent since they joined, except when a block exists either way with the sender.
-- blocked_between is security definer: the blocks table shows a fan only their own blocks.
drop policy dm_group_messages_read on public.dm_group_messages;
create policy dm_group_messages_read on public.dm_group_messages for select to authenticated
  using (
    exists (select 1 from public.dm_group_members m
            where m.group_id = dm_group_messages.group_id and m.user_id = (select auth.uid())
              and m.role in ('admin', 'member') and dm_group_messages.created_at >= m.joined_at)
    and (dm_group_messages.sender_id = (select auth.uid())
         or not public.blocked_between((select auth.uid()), dm_group_messages.sender_id))
  );

-- ---------- 2. wrapped keys size ----------
alter table public.dm_group_messages
  add constraint dm_group_messages_wrapped_keys_size check (pg_column_size(wrapped_keys) < 16000);

-- ---------- 3. invite_to_group returns who was invited ----------
-- Same rules as before. The return type changes, so the function is dropped and recreated (create_group calls it
-- with perform and is unaffected).
drop function public.invite_to_group(uuid, uuid[]);
create function public.invite_to_group(p_group uuid, p_members uuid[]) returns uuid[]
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
  return picked;
end $$;
revoke all on function public.invite_to_group(uuid, uuid[]) from public, anon;
grant execute on function public.invite_to_group(uuid, uuid[]) to authenticated;

-- ---------- 4. who gets a push about a new group message ----------
-- The caller's fellow members who did not mute the group and have no block either way with the caller.
-- Empty when the caller is not a member. Ids only.
create function public.group_push_targets(p_group uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.dm_group_members m
   where m.group_id = p_group and m.role in ('admin', 'member') and not m.muted
     and m.user_id <> (select auth.uid())
     and exists (select 1 from public.dm_group_members me
                  where me.group_id = p_group and me.user_id = (select auth.uid()) and me.role in ('admin', 'member'))
     and not public.blocked_between((select auth.uid()), m.user_id)
$$;
revoke all on function public.group_push_targets(uuid) from public, anon;
grant execute on function public.group_push_targets(uuid) to authenticated;
