-- Team chat, richer (2026-11-28): management ("official") messages, media messages (image/video), and a member count.
-- The existing realtime broadcast already ships the whole NEW row, so the added columns reach subscribers for free.

-- ===== new columns on team_messages =====
alter table public.team_messages
  add column official   boolean not null default false,            -- set by the trigger from channel_can_post(); never by the client
  add column media_path text,                                      -- storage path in the public 'chat' bucket
  add column media_kind text check (media_kind in ('image', 'video'));

-- Media and its kind travel together.
alter table public.team_messages
  add constraint team_messages_media_pair check ((media_path is null) = (media_kind is null));

-- A message now needs text OR media (a media message may carry an empty caption). Replace the text-only rule.
alter table public.team_messages alter column body set default '';
alter table public.team_messages drop constraint team_messages_body_check;
alter table public.team_messages
  add constraint team_messages_content check (
    char_length(btrim(body)) between 1 and 200
    or (media_path is not null and char_length(btrim(body)) <= 200)
  );

-- The client may fill only text + media (reply_to was already granted by the replies migration). 'official' stays server-only.
grant insert (media_path, media_kind) on public.team_messages to authenticated;

-- ===== stamp trigger: also mark management messages =====
-- The club, nick, time and rate-limit are unchanged; we add official := "may this fan post to the club channel?".
create or replace function public.team_messages_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fan record;
begin
  select p.team_id, p.nick into fan from public.profiles p where p.user_id = new.user_id;
  if not found then
    raise exception 'no profile' using errcode = '42501';
  end if;
  new.team_id    := fan.team_id;
  new.nick       := fan.nick;
  new.body       := btrim(new.body);
  new.created_at := now();
  new.official   := public.channel_can_post();
  if (select count(*) from public.team_messages m
      where m.user_id = new.user_id and m.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ===== member count (for the chat header) =====
-- An index already exists on profiles (team_id, created_at), so this count is cheap. Security definer: a fan may see
-- only their own club's size, which is exactly what my_team() pins.
create function public.team_member_count() returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.profiles where team_id = public.my_team();
$$;
revoke all on function public.team_member_count() from public, anon;
grant execute on function public.team_member_count() to authenticated;

-- ===== media bucket for chat (any member uploads to their own folder) =====
-- Public (served via CDN with getPublicUrl), same size/type limits as 'clips' and 'channel'. Unlike 'channel'
-- (admins only), any club member may upload their own chat media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy chat_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy chat_files_read on storage.objects for select to authenticated
  using (bucket_id = 'chat');
create policy chat_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid()::text));
