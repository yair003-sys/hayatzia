-- Like / dislike (אהבתי / לא אהבתי) on team-chat messages (owner 2026-10-18).
--
-- One reaction per fan per message (primary key message_id+user_id), changeable and removable. The exact counts live
-- on the message (likes/dislikes columns, kept by a trigger — never counted on read), and every change is broadcast to
-- the club's private channel "team:<club>" so all fans see it live, reusing the realtime authorisation the team chat
-- already has. Security-definer functions pin search_path; the fan sends only message_id + kind, everything else is
-- stamped server-side; RLS keeps reads and writes inside the fan's own club.

alter table public.team_messages
  add column likes    integer not null default 0,
  add column dislikes integer not null default 0;

create table public.message_reactions (
  message_id uuid not null references public.team_messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id    text not null default '',                         -- stamped from the message (for RLS + realtime scope)
  kind       smallint not null check (kind in (1, -1)),        -- 1 = אהבתי, -1 = לא אהבתי
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
-- Account deletion cascades through a fan's reactions by user.
create index message_reactions_user_idx on public.message_reactions (user_id);

-- The fan sends message_id + kind; the server sets the club (from the message) and the fan, and refuses a message of
-- another club. Runs on insert and on a change of kind.
create function public.message_reactions_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select t.team_id into m from public.team_messages t where t.id = new.message_id;
  if not found then
    raise exception 'no_message' using errcode = '23503';
  end if;
  if m.team_id <> (select public.my_team()) then
    raise exception 'not_your_club' using errcode = '42501';
  end if;
  new.team_id    := m.team_id;
  new.user_id    := (select auth.uid());
  new.created_at := now();
  return new;
end $$;
revoke all on function public.message_reactions_stamp() from public, anon, authenticated;
create trigger message_reactions_stamp before insert or update on public.message_reactions
  for each row execute function public.message_reactions_stamp();

-- Keep the message's counts exact and broadcast {message_id, likes, dislikes} to the club channel.
create function public.message_reactions_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mid uuid; v_likes int; v_dislikes int; tid text;
begin
  mid := coalesce(new.message_id, old.message_id);
  update public.team_messages t set
    likes    = (select count(*) from public.message_reactions r where r.message_id = mid and r.kind = 1),
    dislikes = (select count(*) from public.message_reactions r where r.message_id = mid and r.kind = -1)
  where t.id = mid
  returning t.team_id, t.likes, t.dislikes into tid, v_likes, v_dislikes;
  if tid is not null then
    perform realtime.send(
      jsonb_build_object('message_id', mid, 'likes', v_likes, 'dislikes', v_dislikes),
      'REACTION', 'team:' || tid, true);
  end if;
  return null;
end $$;
revoke all on function public.message_reactions_count() from public, anon, authenticated;
create trigger message_reactions_count after insert or update or delete on public.message_reactions
  for each row execute function public.message_reactions_count();

alter table public.message_reactions enable row level security;

-- Read every reaction on my club's messages (so the app knows my own reaction); write only my own.
create policy message_reactions_read on public.message_reactions for select to authenticated
  using (team_id = (select public.my_team()));
create policy message_reactions_insert on public.message_reactions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy message_reactions_update on public.message_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy message_reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.message_reactions from anon, authenticated;
grant select, delete on public.message_reactions to authenticated;
grant insert (message_id, kind) on public.message_reactions to authenticated;  -- column-level: team_id/user_id are stamped
grant update (kind) on public.message_reactions to authenticated;
