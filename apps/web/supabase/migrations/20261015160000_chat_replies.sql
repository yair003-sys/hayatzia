-- Chat essentials (spec 2026-10-15-chat-essentials-design): replies in all four chats.
--
-- Public chats (team_messages, match_messages): the fan sends `reply_to` only. A BEFORE INSERT trigger checks the
-- replied message is in the same chat (same club / same fixture) and stamps a snapshot of it: `reply_user` (its
-- author, so the app hides a quote of a fan the viewer blocked), `reply_nick` and up to 80 characters of its stored
-- body (`reply_body`). Rendering a reply needs no extra query (no N+1) and still works when the original is not
-- loaded. The fan cannot set the snapshot columns (no grant, and the trigger overwrites them for every caller).
-- The stored body was moderated as a whole, but a cut can create a listed word the whole text did not hold (the filter
-- matches whole words only: "...מוות לערביםק" cut inside the last word, "זינוק" cut to "זין"). So the snapshot is cut
-- at the last space before 81 characters (a single long word is cut at 80) and moderated again; a cut that now holds
-- blocked text keeps no text at all.
--
-- Private messages and groups (end-to-end encrypted): `reply_to` only, checked to be in the same thread / group
-- (and, in a group, sent since the replier joined, i.e. a message they can read). The quoted text is found and
-- decrypted on the device; nothing about the content reaches the server.
--
-- Engineering calls:
-- - No foreign key on reply_to: a foreign key with an on-delete action would need an index on reply_to for every
--   message deleted (account deletion cascades through thousands of rows). The trigger checks the reply by primary key
--   on insert; when the original is gone later, the snapshot (public) or "הודעה קודמת" (private) still shows.
-- - No new index: the only lookup is by primary key.
-- - Realtime: the broadcast triggers send the whole new row (realtime.broadcast_changes(..., new, null)), and AFTER
--   triggers see the stamped snapshot, so the new columns reach the clients with no change there.
-- - Trigger order: BEFORE triggers run by name. "zr_reply" runs after the tables' *_stamp triggers (club, fixture,
--   sender are final by then) and before zz_moderate (which only touches body).

-- ---------- columns ----------
alter table public.team_messages
  add column reply_to   uuid,
  add column reply_user uuid,
  add column reply_nick varchar(20),
  add column reply_body varchar(80);
alter table public.match_messages
  add column reply_to   uuid,
  add column reply_user uuid,
  add column reply_nick varchar(20),
  add column reply_body varchar(80);
alter table public.dm_messages add column reply_to uuid;
alter table public.dm_group_messages add column reply_to uuid;

-- ---------- public chats: check + snapshot ----------
create function public.chat_reply_stamp() returns trigger
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
    select m.user_id, m.nick, m.body into src from public.team_messages m
     where m.id = new.reply_to and m.team_id = new.team_id;
  else
    select m.user_id, m.nick, m.body into src from public.match_messages m
     where m.id = new.reply_to and m.fixture_id = new.fixture_id;
  end if;
  if not found then
    raise exception 'bad_reply' using errcode = '23503';
  end if;
  new.reply_user := src.user_id;
  new.reply_nick := src.nick;
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

create trigger zr_reply before insert on public.team_messages
  for each row execute function public.chat_reply_stamp();
create trigger zr_reply before insert on public.match_messages
  for each row execute function public.chat_reply_stamp();

-- ---------- private messages and groups: same thread / group ----------
create function public.dm_reply_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is null then
    return new;
  end if;
  if tg_table_name = 'dm_messages' then
    perform 1 from public.dm_messages m where m.id = new.reply_to and m.thread_id = new.thread_id;
  else
    perform 1 from public.dm_group_messages m
      join public.dm_group_members g on g.group_id = m.group_id and g.user_id = new.sender_id
     where m.id = new.reply_to and m.group_id = new.group_id
       and g.role in ('admin', 'member') and m.created_at >= g.joined_at;
  end if;
  if not found then
    raise exception 'bad_reply' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function public.dm_reply_check() from public, anon, authenticated;

create trigger zr_reply before insert on public.dm_messages
  for each row execute function public.dm_reply_check();
create trigger zr_reply before insert on public.dm_group_messages
  for each row execute function public.dm_reply_check();

-- ---------- privileges: reply_to joins the column-level insert grants; the snapshot never does ----------
grant insert (reply_to) on public.team_messages to authenticated;
grant insert (reply_to) on public.match_messages to authenticated;
grant insert (reply_to) on public.dm_messages to authenticated;
grant insert (reply_to) on public.dm_group_messages to authenticated;
