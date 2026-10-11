-- P3: end-to-end encrypted private messages, blocks and reports.
-- The server only ever stores ciphertext: the browser encrypts (lib/e2e) and writes directly with the fan's session.

-- ---------- blocks ----------
create table public.blocks (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id, user_id);

-- True when either fan blocked the other.
create function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks k where (k.user_id = a and k.blocked_id = b) or (k.user_id = b and k.blocked_id = a))
$$;
revoke all on function public.blocked_between(uuid, uuid) from public;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

alter table public.blocks enable row level security;
create policy blocks_own_read on public.blocks for select to authenticated using (user_id = (select auth.uid()));
create policy blocks_own_insert on public.blocks for insert to authenticated with check (user_id = (select auth.uid()));
create policy blocks_own_delete on public.blocks for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.blocks from anon, authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;

-- ---------- reports (moderators only; fans can file, never read) ----------
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('team_message', 'match_message', 'clip', 'clip_comment', 'photo', 'photo_comment', 'user', 'dm_thread')),
  ref          varchar(100) not null,
  reason       varchar(60) not null,
  note         varchar(120) not null default '',
  status       text not null default 'open' check (status in ('open', 'handled', 'dismissed')),
  created_at   timestamptz not null default now()
);
create index reports_open_idx on public.reports (status, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

create function public.reports_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'open';
  new.created_at := now();
  if (select count(*) from public.reports r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger reports_limit before insert on public.reports for each row execute function public.reports_limit();

alter table public.reports enable row level security;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
revoke all on public.reports from anon, authenticated;
grant insert (kind, ref, reason, note) on public.reports to authenticated;

-- ---------- device keys (public halves only) ----------
create table public.device_keys (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id   varchar(40) not null check (device_id ~ '^[A-Za-z0-9_-]{6,40}$'),
  public_jwk  text not null check (char_length(public_jwk) < 400),
  created_at  timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- Same club as the caller (private messages are between fans of one club, as in the legacy app).
create function public.same_team(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.user_id = other and p.team_id = public.my_team()
  )
$$;
revoke all on function public.same_team(uuid) from public;
grant execute on function public.same_team(uuid) to authenticated;

alter table public.device_keys enable row level security;
create policy device_keys_read on public.device_keys for select to authenticated
  using (user_id = (select auth.uid()) or public.same_team(user_id));
create policy device_keys_insert_own on public.device_keys for insert to authenticated with check (user_id = (select auth.uid()));
create policy device_keys_delete_own on public.device_keys for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.device_keys from anon, authenticated;
grant select, delete on public.device_keys to authenticated;
grant insert (device_id, public_jwk) on public.device_keys to authenticated;

-- ---------- threads ----------
create table public.dm_threads (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users (id) on delete cascade,
  user_b      uuid not null references auth.users (id) on delete cascade,
  nick_a      varchar(20) not null default '',  -- stamped
  nick_b      varchar(20) not null default '',  -- stamped
  last_at     timestamptz not null default now(),
  last_from   uuid,
  created_at  timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index dm_threads_a_idx on public.dm_threads (user_a, last_at desc);
create index dm_threads_b_idx on public.dm_threads (user_b, last_at desc);

create function public.dm_threads_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
begin
  if me not in (new.user_a, new.user_b) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  other := case when me = new.user_a then new.user_b else new.user_a end;
  if not public.same_team(other) then
    raise exception 'not_same_team' using errcode = '42501';
  end if;
  if public.blocked_between(me, other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  select p.nick into new.nick_a from public.profiles p where p.user_id = new.user_a;
  select p.nick into new.nick_b from public.profiles p where p.user_id = new.user_b;
  new.last_at := now();
  new.last_from := null;
  new.created_at := now();
  return new;
end $$;
create trigger dm_threads_stamp before insert on public.dm_threads for each row execute function public.dm_threads_stamp();

alter table public.dm_threads enable row level security;
create policy dm_threads_members_read on public.dm_threads for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy dm_threads_members_insert on public.dm_threads for insert to authenticated
  with check ((select auth.uid()) in (user_a, user_b));
revoke all on public.dm_threads from anon, authenticated;
grant select on public.dm_threads to authenticated;
grant insert (user_a, user_b) on public.dm_threads to authenticated;

-- ---------- messages (ciphertext only) ----------
create table public.dm_messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.dm_threads (id) on delete cascade,
  sender_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_device  varchar(40) not null,
  iv             varchar(40) not null,
  ciphertext     text not null check (char_length(ciphertext) < 4000),
  wrapped_keys   jsonb not null check (jsonb_typeof(wrapped_keys) = 'object'),
  created_at     timestamptz not null default now()
);
create index dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc, id desc);
create index dm_messages_sender_idx on public.dm_messages (sender_id, created_at desc);

create function public.dm_messages_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  other uuid;
begin
  select * into t from public.dm_threads where id = new.thread_id;
  if not found or new.sender_id not in (t.user_a, t.user_b) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  other := case when new.sender_id = t.user_a then t.user_b else t.user_a end;
  if public.blocked_between(new.sender_id, other) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if (select count(*) from jsonb_object_keys(new.wrapped_keys)) > 20 then
    raise exception 'too many devices' using errcode = '22023';
  end if;
  new.created_at := now();
  if (select count(*) from public.dm_messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger dm_messages_stamp before insert on public.dm_messages for each row execute function public.dm_messages_stamp();

-- After a message: bump the thread and notify both inboxes. Broadcast carries ids only, never content.
create function public.dm_messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  update public.dm_threads set last_at = new.created_at, last_from = new.sender_id where id = new.thread_id
  returning user_a, user_b into t;
  perform realtime.broadcast_changes('dm:' || new.thread_id, tg_op, tg_op, tg_table_name, tg_table_schema, new, null);
  perform realtime.send(jsonb_build_object('thread_id', new.thread_id, 'from', new.sender_id), 'message', 'inbox:' || t.user_a, true);
  perform realtime.send(jsonb_build_object('thread_id', new.thread_id, 'from', new.sender_id), 'message', 'inbox:' || t.user_b, true);
  return null;
end $$;
create trigger dm_messages_after after insert on public.dm_messages for each row execute function public.dm_messages_after();

alter table public.dm_messages enable row level security;
create policy dm_messages_members_read on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_threads t where t.id = thread_id and (select auth.uid()) in (t.user_a, t.user_b)));
create policy dm_messages_insert_self on public.dm_messages for insert to authenticated
  with check (sender_id = (select auth.uid()));
revoke all on public.dm_messages from anon, authenticated;
grant select on public.dm_messages to authenticated;
grant insert (thread_id, sender_device, iv, ciphertext, wrapped_keys) on public.dm_messages to authenticated;

-- Realtime: a thread's channel only for its two members; each fan's inbox channel only for them.
create policy dm_channel_receive on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and (
    realtime.topic() = 'inbox:' || (select auth.uid())::text
    or exists (
      select 1 from public.dm_threads t
      where realtime.topic() = 'dm:' || t.id and (select auth.uid()) in (t.user_a, t.user_b)
    )
  )
);
