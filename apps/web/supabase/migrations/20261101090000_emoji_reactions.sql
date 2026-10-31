-- Emoji reactions on team-chat messages (owner 2026-11-01): replace the binary like/dislike that showed on every
-- message with any emoji. Double-tap a message = ❤️; a single tap opens a bar of popular emoji + "+" for more.
-- One reaction per fan per message (changeable/removable). The per-emoji counts live on the message as a jsonb
-- {emoji: count}, kept by a trigger (never counted on read) and broadcast live to the club's channel. The same shape
-- will serve channel-post reactions later.

-- 1) message_reactions: kind (±1) -> emoji text.
alter table public.message_reactions add column emoji text;
update public.message_reactions set emoji = case when kind = 1 then '👍' else '👎' end;
alter table public.message_reactions alter column emoji set not null;
alter table public.message_reactions add constraint message_reactions_emoji_len check (char_length(emoji) between 1 and 32);

-- Dropping kind removes its column-level grants; re-grant on emoji (team_id/user_id stay server-stamped).
alter table public.message_reactions drop column kind;
grant insert (message_id, emoji) on public.message_reactions to authenticated;
grant update (emoji) on public.message_reactions to authenticated;

-- 2) team_messages: likes/dislikes ints -> reactions jsonb {emoji: count}.
alter table public.team_messages add column reactions jsonb not null default '{}'::jsonb;
alter table public.team_messages drop column likes;
alter table public.team_messages drop column dislikes;

-- 3) recompute: rebuild the jsonb aggregate for the message and broadcast {message_id, reactions} to the club channel.
create or replace function public.message_reactions_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mid uuid; v_reactions jsonb; tid text;
begin
  mid := coalesce(new.message_id, old.message_id);
  select coalesce(jsonb_object_agg(e.emoji, e.c), '{}'::jsonb) into v_reactions
    from (select emoji, count(*)::int as c from public.message_reactions where message_id = mid group by emoji) e;
  update public.team_messages t set reactions = v_reactions where t.id = mid returning t.team_id into tid;
  if tid is not null then
    perform realtime.send(
      jsonb_build_object('message_id', mid, 'reactions', v_reactions),
      'REACTION', 'team:' || tid, true);
  end if;
  return null;
end $$;
revoke all on function public.message_reactions_count() from public, anon, authenticated;
-- The existing trigger (after insert/update/delete on message_reactions) points at this function; replacing the
-- function body is enough. The stamp trigger (before insert/update) never referenced kind, so it is unchanged.
