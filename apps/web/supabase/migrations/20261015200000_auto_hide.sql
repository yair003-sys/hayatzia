-- Auto-hide (owner, 2026-10-15): content reported by at least 25 DIFFERENT fans is hidden automatically until the
-- admin decides. Only reports from accounts that were at least 3 days old when they reported count (no brigading with
-- fresh accounts; profiles.created_at is stamped by the database). The same fan reporting twice counts once. The row is
-- HIDDEN (hidden_at), never deleted: the admin then removes it (admin_remove_content, unchanged) or puts it back
-- (admin_restore_content, which also dismisses the open reports on it).
--
-- Engineering calls:
-- - Who still sees a hidden row: its author (so the author does not notice a ghost and argue with it) and admins
--   (is_app_admin()). Everyone else: as if it were gone. Done with one RESTRICTIVE select policy per table, ANDed with
--   the existing permissive policies, so nothing else about who may read what changes (no existing policy is touched).
-- - Everything that shows content to other fans goes through RLS: feeds, hot clips, stories, home_player_reviews
--   (invoker), comments ("exists the post" in their policies), likes / respects / fires / seat requests (their insert
--   policies check the post through RLS), and the files (the Storage read policies check the row through RLS). The
--   security definer functions that read these tables return counts and nicknames only (home_active_fans,
--   home_fans_of_week, crowd war tallies) or are the admin's own (report_target), so they need no filter. The one
--   definer path that copied content to other fans is the reply quote (chat_reply_stamp): a reply to a hidden message
--   quotes the nickname only, and hiding a message clears the quotes already made of it (bounded by the chat's own
--   index: same club / fixture, newer than the message). A restore does not bring those quotes back.
-- - Realtime: chat broadcasts fire on INSERT only, so hiding (an UPDATE) never re-broadcasts a row. Open screens keep
--   showing a just-hidden row until they reload; there is no "remove" event in the clients today, and adding one is not
--   worth it for a rare event that the next load fixes.
-- - Fans can never set or clear hidden_at: the new column gets no insert or update grant on any of these tables (all
--   their write grants are column-level).
-- - The rules (25 fans, 3 days) live in one place: private.auto_hide_rules(). Change them with create or replace.
-- - Only OPEN reports count, so after a restore (reports dismissed) a new wave starts from zero.
-- - Reports on one piece of content are counted one at a time (transaction advisory lock on kind:ref), so two reports
--   arriving together cannot both miss the threshold.

-- ---------- 1. the column ----------
alter table public.team_messages       add column hidden_at timestamptz;
alter table public.match_messages      add column hidden_at timestamptz;
alter table public.clips               add column hidden_at timestamptz;
alter table public.clip_comments       add column hidden_at timestamptz;
alter table public.team_photos         add column hidden_at timestamptz;
alter table public.team_photo_comments add column hidden_at timestamptz;
alter table public.player_ratings      add column hidden_at timestamptz;
alter table public.market_items        add column hidden_at timestamptz;
alter table public.trips               add column hidden_at timestamptz;
alter table public.fan_events          add column hidden_at timestamptz;
alter table public.chants              add column hidden_at timestamptz;

-- ---------- 2. who reads a hidden row: its author and admins ----------
create policy team_messages_not_hidden on public.team_messages as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy match_messages_not_hidden on public.match_messages as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy clips_not_hidden on public.clips as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy clip_comments_not_hidden on public.clip_comments as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy team_photos_not_hidden on public.team_photos as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy team_photo_comments_not_hidden on public.team_photo_comments as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy player_ratings_not_hidden on public.player_ratings as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy market_items_not_hidden on public.market_items as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy trips_not_hidden on public.trips as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy fan_events_not_hidden on public.fan_events as restrictive for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or (select public.is_app_admin()));
create policy chants_not_hidden on public.chants as restrictive for select to authenticated
  using (hidden_at is null or created_by = (select auth.uid()) or (select public.is_app_admin()));

-- ---------- 3. the rules, in one place ----------
create function private.auto_hide_rules(out min_reporters integer, out min_account_age interval)
language sql immutable set search_path = '' as $$
  select 25, interval '3 days'
$$;

-- When the reported content was hidden (null: visible, or not found, or not hideable: 'user', 'dm_thread', 'contact').
-- By primary key (a review by (player, author)), like private.report_target.
create function private.content_hidden_at(p_kind text, p_ref text) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p_ref);
  v_at timestamptz;
begin
  case p_kind
    when 'team_message' then select m.hidden_at into v_at from public.team_messages m where m.id = v_id;
    when 'match_message' then select m.hidden_at into v_at from public.match_messages m where m.id = v_id;
    when 'clip' then select c.hidden_at into v_at from public.clips c where c.id = v_id;
    when 'clip_comment' then select c.hidden_at into v_at from public.clip_comments c where c.id = v_id;
    when 'photo' then select p.hidden_at into v_at from public.team_photos p where p.id = v_id;
    when 'photo_comment' then select c.hidden_at into v_at from public.team_photo_comments c where c.id = v_id;
    when 'review' then
      select r.hidden_at into v_at from public.player_ratings r
       where r.user_id = private.try_uuid(right(p_ref, 36)) and r.player_id = left(p_ref, greatest(char_length(p_ref) - 37, 0));
    when 'market_item' then select i.hidden_at into v_at from public.market_items i where i.id = v_id;
    when 'trip' then select t.hidden_at into v_at from public.trips t where t.id = v_id;
    when 'event' then select e.hidden_at into v_at from public.fan_events e where e.id = v_id;
    when 'chant' then select c.hidden_at into v_at from public.chants c where c.id = v_id;
    else
      v_at := null;
  end case;
  return v_at;
end $$;

-- Hides (p_hide) or shows the reported content. True only when its state changed. Hiding a chat message also clears
-- the quotes other messages made of it (reply_body), over the chat's own (club / fixture, created_at) index.
create function private.set_content_hidden(p_kind text, p_ref text, p_hide boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p_ref);
  v_at timestamptz := case when p_hide then now() end;
  v_done boolean := false;
  v_team text;
  v_fixture bigint;
  v_created timestamptz;
begin
  case p_kind
    when 'team_message' then
      update public.team_messages m set hidden_at = v_at where m.id = v_id and (m.hidden_at is null) = p_hide
        returning m.team_id, m.created_at into v_team, v_created;
      v_done := found;
      if v_done and p_hide then
        update public.team_messages m set reply_body = null
         where m.team_id = v_team and m.created_at >= v_created and m.reply_to = v_id and m.reply_body is not null;
      end if;
    when 'match_message' then
      update public.match_messages m set hidden_at = v_at where m.id = v_id and (m.hidden_at is null) = p_hide
        returning m.fixture_id, m.created_at into v_fixture, v_created;
      v_done := found;
      if v_done and p_hide then
        update public.match_messages m set reply_body = null
         where m.fixture_id = v_fixture and m.created_at >= v_created and m.reply_to = v_id and m.reply_body is not null;
      end if;
    when 'clip' then
      update public.clips c set hidden_at = v_at where c.id = v_id and (c.hidden_at is null) = p_hide;
      v_done := found;
    when 'clip_comment' then
      update public.clip_comments c set hidden_at = v_at where c.id = v_id and (c.hidden_at is null) = p_hide;
      v_done := found;
    when 'photo' then
      update public.team_photos p set hidden_at = v_at where p.id = v_id and (p.hidden_at is null) = p_hide;
      v_done := found;
    when 'photo_comment' then
      update public.team_photo_comments c set hidden_at = v_at where c.id = v_id and (c.hidden_at is null) = p_hide;
      v_done := found;
    when 'review' then
      update public.player_ratings r set hidden_at = v_at
       where r.user_id = private.try_uuid(right(p_ref, 36)) and r.player_id = left(p_ref, greatest(char_length(p_ref) - 37, 0))
         and (r.hidden_at is null) = p_hide;
      v_done := found;
    when 'market_item' then
      update public.market_items i set hidden_at = v_at where i.id = v_id and (i.hidden_at is null) = p_hide;
      v_done := found;
    when 'trip' then
      update public.trips t set hidden_at = v_at where t.id = v_id and (t.hidden_at is null) = p_hide;
      v_done := found;
    when 'event' then
      update public.fan_events e set hidden_at = v_at where e.id = v_id and (e.hidden_at is null) = p_hide;
      v_done := found;
    when 'chant' then
      update public.chants c set hidden_at = v_at where c.id = v_id and (c.hidden_at is null) = p_hide;
      v_done := found;
    else
      raise exception 'bad_kind' using errcode = '22023';
  end case;
  return v_done;
end $$;

revoke all on function private.auto_hide_rules() from public, anon, authenticated;
revoke all on function private.content_hidden_at(text, text) from public, anon, authenticated;
revoke all on function private.set_content_hidden(text, text, boolean) from public, anon, authenticated;

-- ---------- 4. the audit trail knows the two new actions ----------
alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('remove', 'ban', 'unban', 'status', 'auto_hide', 'restore'));

-- ---------- 5. the count, on every new report ----------
-- Distinct reporters among the open reports on one (kind, ref), read from this index only up to the threshold. It
-- also serves "N reports on this content" and "handle every open report on it", so it replaces reports_target_open_idx.
create index reports_target_reporters_idx on public.reports (kind, ref, reporter_id) where status = 'open';
drop index public.reports_target_open_idx;

create function private.reports_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rules record;
  n integer;
begin
  if new.kind not in ('team_message', 'match_message', 'clip', 'clip_comment', 'photo', 'photo_comment', 'review',
                      'market_item', 'trip', 'event', 'chant')
     or new.reporter_id is null or new.status <> 'open' then
    return null;
  end if;
  select * into rules from private.auto_hide_rules();
  -- A report from an account younger than the minimum age changes nothing: no count needed.
  if not exists (select 1 from public.profiles p
                  where p.user_id = new.reporter_id and p.created_at <= new.created_at - rules.min_account_age) then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('auto_hide:' || new.kind || ':' || new.ref, 0));
  if private.content_hidden_at(new.kind, new.ref::text) is not null then
    return null;
  end if;
  select count(*)::int into n from (
    select distinct r.reporter_id
      from public.reports r join public.profiles p on p.user_id = r.reporter_id
     where r.kind = new.kind and r.ref = new.ref and r.status = 'open'
       and p.created_at <= r.created_at - rules.min_account_age
     limit rules.min_reporters
  ) x;
  if n >= rules.min_reporters and private.set_content_hidden(new.kind, new.ref::text, true) then
    insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
      values (null, 'auto_hide', new.kind, new.ref,
              (select t.target_user from private.report_target(new.kind, new.ref::text, null) t),
              n || ' fans reported');
  end if;
  return null;
end $$;
revoke all on function private.reports_auto_hide() from public, anon, authenticated;
create trigger reports_auto_hide after insert on public.reports
  for each row execute function private.reports_auto_hide();

-- ---------- 6. admin: the queue says what is hidden; restore ----------
drop function public.admin_report_queue(text, int, timestamptz, uuid);
create function public.admin_report_queue(
  p_status text default 'open', p_limit int default 50, p_before timestamptz default null, p_before_id uuid default null)
returns table (
  id uuid, kind text, ref text, reason text, note text, status text, created_at timestamptz,
  reporter_nick text, reporter_contact text, target_user_id uuid, target_nick text, target_preview text,
  target_exists boolean, open_reports_on_target int, target_hidden boolean)
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
                else (select count(*)::int from public.reports o where o.status = 'open' and o.kind = r.kind and o.ref = r.ref) end,
           private.content_hidden_at(r.kind, r.ref::text) is not null
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
revoke all on function public.admin_report_queue(text, int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_report_queue(text, int, timestamptz, uuid) to authenticated;

-- Puts hidden content back for everyone and dismisses the open reports on it (the admin decided it is fine). True when
-- it was hidden. admin_remove_content keeps working on hidden rows (it is security definer, no RLS).
create function public.admin_restore_content(p_kind text, p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_shown boolean;
  v_user uuid;
  n integer;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('team_message', 'match_message', 'clip', 'clip_comment', 'photo', 'photo_comment',
                                      'review', 'market_item', 'trip', 'event', 'chant') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  v_shown := private.set_content_hidden(p_kind, p_ref, false);
  select t.target_user into v_user from private.report_target(p_kind, p_ref, null) t;
  update public.reports r set status = 'dismissed' where r.status = 'open' and r.kind = p_kind and r.ref = p_ref;
  get diagnostics n = row_count;
  insert into public.admin_actions (admin_id, action, kind, ref, target_user, note)
    values (auth.uid(), 'restore', p_kind, left(p_ref, 100), v_user,
            case when v_shown then n || ' reports dismissed' else 'was not hidden; ' || n || ' reports dismissed' end);
  return v_shown;
end $$;
revoke all on function public.admin_restore_content(text, text) from public, anon;
grant execute on function public.admin_restore_content(text, text) to authenticated;

-- ---------- 7. a reply never quotes a hidden message ----------
-- Unchanged (20261015160000_chat_replies) except: the replied message's hidden_at is read, and a hidden one is quoted
-- by its nickname only (its author still sees it and may reply to it).
create or replace function public.chat_reply_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  src record;
  cut text;
begin
  new.reply_user := null;
  new.reply_nick := null;
  new.reply_body := null;
  if new.reply_to is null then
    return new;
  end if;
  if tg_table_name = 'team_messages' then
    select m.user_id, m.nick, m.body, m.hidden_at into src from public.team_messages m
     where m.id = new.reply_to and m.team_id = new.team_id;
  else
    select m.user_id, m.nick, m.body, m.hidden_at into src from public.match_messages m
     where m.id = new.reply_to and m.fixture_id = new.fixture_id;
  end if;
  if not found then
    raise exception 'bad_reply' using errcode = '23503';
  end if;
  new.reply_user := src.user_id;
  new.reply_nick := src.nick;
  if src.hidden_at is not null then
    return new;
  end if;
  cut := src.body;
  if char_length(cut) > 80 then
    -- Up to the last whitespace within the first 81 characters (so a word ending at 80 is kept whole).
    cut := coalesce(rtrim(substring(left(cut, 81) from '^(.*)\s')), left(cut, 80));
    if cut = '' then
      cut := left(src.body, 80);
    end if;
  end if;
  begin
    new.reply_body := left(public.moderate_text(cut), 80);
  exception when check_violation then
    new.reply_body := null;   -- the cut holds blocked text: quote the nick only
  end;
  return new;
end $$;
revoke all on function public.chat_reply_stamp() from public, anon, authenticated;
