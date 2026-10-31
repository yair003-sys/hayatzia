-- Profile photos (2026-10-31): a fan's avatar and cover photo ("תמונת נושא"), like a Facebook profile.
-- Two public-read buckets, each write-your-own-folder; the chosen path lives on the profile.
-- Rows store the Storage path, never bytes (architecture rule). The public view of a fan is /fans/[userId].

alter table public.profiles add column avatar_path text;
alter table public.profiles add column cover_path text;

-- Readable by any fan (a public profile shows the photo); set only by the fan, on their own row.
grant select (avatar_path, cover_path) on public.profiles to authenticated;
grant update (avatar_path, cover_path) on public.profiles to authenticated;

-- A path must sit in the fan's own folder, so a fan can never point their profile at someone else's file.
-- Mirrors chants_own_file: checked on every write of these two columns.
create or replace function public.profile_photo_own_path() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if new.avatar_path is not null and split_part(new.avatar_path, '/', 1) <> new.user_id::text then
    raise exception 'bad_path' using errcode = '42501';
  end if;
  if new.cover_path is not null and split_part(new.cover_path, '/', 1) <> new.user_id::text then
    raise exception 'bad_path' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.profile_photo_own_path() from public, anon, authenticated;

create trigger profiles_photo_path before insert or update of avatar_path, cover_path on public.profiles
  for each row execute function public.profile_photo_own_path();

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('covers', 'covers', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets: anyone may read the photo (profile photos are meant to be seen).
-- A fan writes, replaces and removes only inside their own folder (<user id>/<file>).
create policy avatars_read on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy covers_read on storage.objects for select to anon, authenticated using (bucket_id = 'covers');
create policy covers_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy covers_update_own on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy covers_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
