-- Moderation screen (owner, 2026-10-15): the operator must remove reported illegal content fast. Admins see the
-- reports with a short preview of the reported content and act on them in one tap: remove the content, suspend the
-- writer from writing (7 days or for good), or dismiss the report. Every admin action leaves an audit row.
-- Also: reports outlive the reporter's account (the report is about someone else's content), new report kinds for
-- the team boards, and 'contact' — a general request ("צור קשר": privacy, accessibility, other) with no target.
--
-- Admins are added by hand, once, in the SQL editor of each project (never in a migration):
--   insert into public.app_admins (user_id) select id from auth.users where email = '<owner email>';

-- ---------- admins ----------
create table public.app_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;  -- no policies: read only through is_app_admin()
revoke all on public.app_admins from public, anon, authenticated;

create function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid())
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- ---------- reports: kept when the reporter leaves, more kinds, a longer note for 'contact' ----------
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references auth.users (id) on delete set null;

alter table public.reports drop constraint reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in (
  'team_message', 'match_message', 'clip', 'clip_comment', 'photo', 'photo_comment', 'user', 'dm_thread',
  'market_item', 'trip', 'event', 'chant', 'review', 'contact'));

-- A report's note stays short (120); a contact request may say more (500) and must say something.
alter table public.reports alter column note type varchar(500);
alter table public.reports add constraint reports_note_size
  check (char_length(note) <= case when kind = 'contact' then 500 else 120 end);
alter table public.reports add constraint reports_contact_text
  check (kind <> 'contact' or char_length(btrim(note)) >= 2);

-- "N reports on this content" and "handle every open report on it".
create index reports_target_open_idx on public.reports (kind, ref) where status = 'open';

-- ---------- suspensions ----------
create table public.fan_bans (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  until       timestamptz,                         -- null = for good
  reason      varchar(120) not null default '',
  by_admin    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index fan_bans_by_admin_idx on public.fan_bans (by_admin);
alter table public.fan_bans enable row level security;  -- no policies: admins use the RPCs below
revoke all on public.fan_bans from public, anon, authenticated;

-- ---------- audit ----------
create table public.admin_actions (
  id           bigint generated always as identity primary key,
  admin_id     uuid references auth.users (id) on delete set null,
  action       text not null check (action in ('remove', 'ban', 'unban', 'status')),
  kind         text,
  ref          varchar(100),
  target_user  uuid,                               -- no foreign key: the record stays after the account is gone
  note         varchar(200) not null default '',
  created_at   timestamptz not null default now()
);
create index admin_actions_recent_idx on public.admin_actions (created_at desc, id desc);
create index admin_actions_admin_idx on public.admin_actions (admin_id);
alter table public.admin_actions enable row level security;  -- no policies: read through admin_recent_actions()
revoke all on public.admin_actions from public, anon, authenticated;

-- ---------- helpers (private) ----------
create function private.try_uuid(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

create function private.is_banned(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fan_bans b where b.user_id = p_user and (b.until is null or b.until > now()))
$$;

-- What a report points at: the writer, a plain-text excerpt (≤ 200) and whether it still exists.
-- A review's ref is '<player id>:<author id>'. A private conversation is end-to-end encrypted: its "preview" is the two
-- nicknames only, never anything from its messages; the target is the member who did not report it.
create function private.report_target(p_kind text, p_ref text, p_reporter uuid)
returns table (target_user uuid, target_preview text, target_found boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p_ref);
  v_user uuid;
  v_text text;
  a uuid;
  b uuid;
begin
  case p_kind
    when 'team_message' then
      select m.user_id, m.body into v_user, v_text from public.team_messages m where m.id = v_id;
    when 'match_message' then
      select m.user_id, m.body into v_user, v_text from public.match_messages m where m.id = v_id;
    when 'clip' then
      select c.user_id, case when c.kind = 'video' then 'סרטון' else 'תמונה' end
                        || case when c.caption <> '' then ': ' || c.caption else '' end
                        || case when c.tags <> '' then ' · ' || c.tags else '' end
        into v_user, v_text from public.clips c where c.id = v_id;
    when 'clip_comment' then
      select c.user_id, c.body into v_user, v_text from public.clip_comments c where c.id = v_id;
    when 'photo' then
      select p.user_id, 'תמונה ביציע' || case when p.caption <> '' then ': ' || p.caption else '' end
        into v_user, v_text from public.team_photos p where p.id = v_id;
    when 'photo_comment' then
      select c.user_id, c.body into v_user, v_text from public.team_photo_comments c where c.id = v_id;
    when 'review' then
      select r.user_id, r.stars || '★' || case when r.review <> '' then ' ' || r.review else '' end
        into v_user, v_text from public.player_ratings r
       where r.user_id = private.try_uuid(right(p_ref, 36))
         and r.player_id = left(p_ref, greatest(char_length(p_ref) - 37, 0));
    when 'market_item' then
      select i.user_id, i.title into v_user, v_text from public.market_items i where i.id = v_id;
    when 'trip' then
      select t.user_id, t.from_city || case when t.note <> '' then ' · ' || t.note else '' end
        into v_user, v_text from public.trips t where t.id = v_id;
    when 'event' then
      select e.user_id, e.title into v_user, v_text from public.fan_events e where e.id = v_id;
    when 'chant' then
      select c.created_by, c.title into v_user, v_text from public.chants c where c.id = v_id;
    when 'user' then
      select p.user_id, p.nick into v_user, v_text from public.profiles p where p.user_id = v_id;
    when 'dm_thread' then
      select t.user_a, t.user_b, t.nick_a || ' ↔ ' || t.nick_b into a, b, v_text from public.dm_threads t where t.id = v_id;
      if v_text is not null then
        v_user := case when p_reporter = a then b when p_reporter = b then a end;
        return query select v_user, v_text, true;
        return;
      end if;
    else
      null;  -- 'contact': no target
  end case;
  return query select v_user, left(regexp_replace(v_text, '\s+', ' ', 'g'), 200), v_user is not null;
end $$;

revoke all on function private.try_uuid(text) from public, anon, authenticated;
revoke all on function private.is_banned(uuid) from public, anon, authenticated;
revoke all on function private.report_target(text, text, uuid) from public, anon, authenticated;

-- ---------- the filter trigger, now also the suspension check ----------
-- Unchanged filter (20261015120000_moderation), plus: a suspended fan cannot write. Checked on every insert, and on
-- an update only when a filtered column (the text itself) changes, so counters, "sold" flags and the "set null" steps
-- of an account deletion, which update these rows under the acting fan's identity, keep working.
create or replace function private.moderate_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  col text;
  kind text;
  val text;
  fixed text;
  r jsonb := to_jsonb(new);
  writes boolean := tg_op = 'INSERT';
begin
  if auth.uid() is not null then
    if not writes then
      foreach col in array tg_argv loop
        if (to_jsonb(old) ->> split_part(col, ':', 1)) is distinct from (r ->> split_part(col, ':', 1)) then
          writes := true;
          exit;
        end if;
      end loop;
    end if;
    if writes and private.is_banned(auth.uid()) then
      raise exception 'banned' using errcode = '42501';
    end if;
  end if;

  foreach col in array tg_argv loop
    kind := split_part(col, ':', 2);
    col := split_part(col, ':', 1);
    val := r ->> col;
    if val is null or val = '' then
      continue;
    end if;
    if tg_op = 'UPDATE' and (to_jsonb(old) ->> col) is not distinct from val then
      continue;
    end if;
    fixed := case when kind = 'name' then public.moderate_name(val) else public.moderate_text(val) end;
    if fixed is distinct from val then
      r := jsonb_set(r, array[col], to_jsonb(fixed));
    end if;
  end loop;
  new := jsonb_populate_record(new, r);
  return new;
end $$;
revoke all on function private.moderate_row() from public, anon, authenticated;

-- ---------- admin RPCs (signed-in admins only; everything else is refused with 'not_admin') ----------

-- The queue, newest first, keyset by (created_at, id). Index: reports_open_idx (status, created_at desc).
-- reporter_contact (e-mail or phone) only for 'contact' requests, so the operator can answer them.
create function public.admin_report_queue(
  p_status text default 'open', p_limit int default 50, p_before timestamptz default null, p_before_id uuid default null)
returns table (
  id uuid, kind text, ref text, reason text, note text, status text, created_at timestamptz,
  reporter_nick text, reporter_contact text, target_user_id uuid, target_nick text, target_preview text,
  target_exists boolean, open_reports_on_target int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_status not in ('open', 'handled', 'dismissed') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  return query
    select r.id, r.kind, r.ref::text, r.reason::text, r.note::text, r.status, r.created_at,
           rp.nick::text,
           case when r.kind = 'contact' then coalesce(nullif(u.email, ''), nullif(u.phone, ''))::text end,
           t.target_user, tp.nick::text, t.target_preview, t.target_found,
           case when r.kind = 'contact' then 0
                else (select count(*)::int from public.reports o where o.status = 'open' and o.kind = r.kind and o.ref = r.ref) end
      from (select q.* from public.reports q
             where q.status = p_status
               and (p_before is null or q.created_at < p_before
                    or (p_before_id is not null and q.created_at = p_before and q.id < p_before_id))
             order by q.created_at desc, q.id desc
             limit least(greatest(coalesce(p_limit, 50), 1), 100)) r
      left join public.profiles rp on rp.user_id = r.reporter_id
      left join auth.users u on r.kind = 'contact' and u.id = r.reporter_id
      cross join lateral private.report_target(r.kind, r.ref::text, r.reporter_id) t
      left join public.profiles tp on tp.user_id = t.target_user
     order by r.created_at desc, r.id desc;
end $$;

create function public.admin_open_count() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return (select count(*)::int from public.reports r where r.status = 'open');
end $$;

-- Deletes the reported row and marks every open report on it handled. Returns the Storage file to remove (bucket +
-- path) when the row had one; the server action deletes it with the service key.
create function public.admin_remove_content(p_kind text, p_ref text)
returns table (removed boolean, bucket text, path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p_ref);
  v_user uuid;
  v_bucket text;
  v_path text;
  v_removed boolean := false;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select t.target_user into v_user from private.report_target(p_kind, p_ref, null) t;
  case p_kind
    when 'team_message' then delete from public.team_messages m where m.id = v_id;
    when 'match_message' then delete from public.match_messages m where m.id = v_id;
    when 'clip' then delete from public.clips c where c.id = v_id returning 'clips', c.media_path into v_bucket, v_path;
    when 'clip_comment' then delete from public.clip_comments c where c.id = v_id;
    when 'photo' then delete from public.team_photos p where p.id = v_id returning 'stand', p.media_path into v_bucket, v_path;
    when 'photo_comment' then delete from public.team_photo_comments c where c.id = v_id;
    when 'review' then
      delete from public.player_ratings r
       where r.user_id = private.try_uuid(right(p_ref, 36)) and r.player_id = left(p_ref, greatest(char_length(p_ref) - 37, 0));
    when 'market_item' then delete from public.market_items i where i.id = v_id returning 'market', i.media_path into v_bucket, v_path;
    when 'trip' then delete from public.trips t where t.id = v_id;
    when 'event' then delete from public.fan_events e where e.id = v_id;
    when 'chant' then delete from public.chants c where c.id = v_id returning 'chants', c.audio_path into v_bucket, v_path;
    else
      raise exception 'bad_kind' using errcode = '22023';
  end case;
  v_removed := found;
  if v_path is null then
    v_bucket := null;
  end if;

  update public.reports r set status = 'handled' where r.status = 'open' and r.kind = p_kind and r.ref = p_ref;
  insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
    values (auth.uid(), 'remove', p_kind, left(p_ref, 100), v_user, case when v_removed then '' else 'already gone' end);
  return query select v_removed, v_bucket, v_path;
end $$;

-- Suspends a fan from writing (null days = for good) and marks every open report about them handled. Never an admin.
create function public.admin_ban_user(p_user uuid, p_days int default null, p_reason text default '')
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'no_user' using errcode = '22023';
  end if;
  if exists (select 1 from public.app_admins a where a.user_id = p_user) then
    raise exception 'cannot_ban_admin' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'bad_days' using errcode = '22023';
  end if;
  v_until := case when p_days is null then null else now() + make_interval(days => p_days) end;

  insert into public.fan_bans (user_id, until, reason, by_admin)
    values (p_user, v_until, left(coalesce(p_reason, ''), 120), auth.uid())
  on conflict (user_id) do update
    set until = excluded.until, reason = excluded.reason, by_admin = excluded.by_admin, created_at = now();

  update public.reports r set status = 'handled'
   where r.status = 'open' and r.kind <> 'contact'
     and (select t.target_user from private.report_target(r.kind, r.ref::text, r.reporter_id) t) = p_user;

  insert into public.admin_actions (admin_id, action, target_user, note)
    values (auth.uid(), 'ban', p_user, left(coalesce(p_days::text || ' days', 'forever') || ' ' || coalesce(p_reason, ''), 200));
  return v_until;
end $$;

create function public.admin_unban_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  delete from public.fan_bans b where b.user_id = p_user;
  insert into public.admin_actions (admin_id, action, target_user) values (auth.uid(), 'unban', p_user);
end $$;

create function public.admin_set_report_status(p_report uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rep record;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_status not in ('open', 'handled', 'dismissed') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  update public.reports r set status = p_status where r.id = p_report returning r.kind, r.ref into rep;
  if not found then
    raise exception 'no_report' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (admin_id, action, kind, ref, note) values (auth.uid(), 'status', rep.kind, rep.ref, p_status);
end $$;

-- Fans suspended right now (newest first).
create function public.admin_ban_list(p_limit int default 50)
returns table (user_id uuid, nick text, until timestamptz, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select b.user_id, p.nick::text, b.until, b.reason::text, b.created_at
      from public.fan_bans b
      left join public.profiles p on p.user_id = b.user_id
     where b.until is null or b.until > now()
     order by b.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- The audit trail, newest first.
create function public.admin_recent_actions(p_limit int default 20)
returns table (id bigint, action text, kind text, ref text, target_user uuid, target_nick text, admin_nick text,
               note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select a.id, a.action, a.kind, a.ref::text, a.target_user, tp.nick::text, ap.nick::text, a.note::text, a.created_at
      from public.admin_actions a
      left join public.profiles tp on tp.user_id = a.target_user
      left join public.profiles ap on ap.user_id = a.admin_id
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

revoke all on function public.admin_report_queue(text, int, timestamptz, uuid) from public, anon;
revoke all on function public.admin_open_count() from public, anon;
revoke all on function public.admin_remove_content(text, text) from public, anon;
revoke all on function public.admin_ban_user(uuid, int, text) from public, anon;
revoke all on function public.admin_unban_user(uuid) from public, anon;
revoke all on function public.admin_set_report_status(uuid, text) from public, anon;
revoke all on function public.admin_ban_list(int) from public, anon;
revoke all on function public.admin_recent_actions(int) from public, anon;
grant execute on function public.admin_report_queue(text, int, timestamptz, uuid) to authenticated;
grant execute on function public.admin_open_count() to authenticated;
grant execute on function public.admin_remove_content(text, text) to authenticated;
grant execute on function public.admin_ban_user(uuid, int, text) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;
grant execute on function public.admin_set_report_status(uuid, text) to authenticated;
grant execute on function public.admin_ban_list(int) to authenticated;
grant execute on function public.admin_recent_actions(int) to authenticated;

-- ---------- security review 2026-10-15 ----------

-- (1) Consent is recorded with the profile. A fan's own insert must carry the current terms version (restrictive
-- policy; the sign-up action sends TERMS_VERSION from lib/legal.ts). Rows from before this column are 'legacy';
-- service-role scripts (demo fans) bypass RLS and keep the default. The fan can never change it afterwards (the
-- update grant is the nickname only). A new terms version = a migration that replaces this policy.
alter table public.profiles add column terms_version varchar(20) not null default 'legacy';
create policy profiles_insert_terms on public.profiles as restrictive for insert to authenticated
  with check (terms_version = '2026-10-15');

-- (2) No escaping a suspension by deleting the account: the delete action asks first, with the fan's session.
create function public.my_ban_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_banned(auth.uid())
$$;
revoke all on function public.my_ban_active() from public, anon;
grant execute on function public.my_ban_active() to authenticated;

-- (3) A song's recording must be in its creator's own folder, as for every other media table (otherwise a rep could
-- point a song at someone else's file and make it readable to the club through chants_files_read).
create function public.chants_own_file() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.audio_path is not null and split_part(new.audio_path, '/', 1) <> new.created_by::text then
    raise exception 'bad_path' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.chants_own_file() from public, anon, authenticated;
create trigger chants_own_file before insert or update on public.chants
  for each row execute function public.chants_own_file();

-- (4) A kept contact request says nothing about the person once their account is gone: its text is cleared when the
-- account deletion sets the reporter to null.
create function public.reports_forget_contact() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.reporter_id is not null and new.reporter_id is null and new.kind = 'contact' then
    new.note := 'הפנייה נמחקה עם החשבון';
  end if;
  return new;
end $$;
revoke all on function public.reports_forget_contact() from public, anon, authenticated;
create trigger reports_forget_contact before update of reporter_id on public.reports
  for each row execute function public.reports_forget_contact();
