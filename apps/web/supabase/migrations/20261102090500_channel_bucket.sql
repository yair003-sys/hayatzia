-- Public media bucket for channel posts (2026-11-01). Channel media is club-broadcast content, so the bucket is public
-- (served via CDN, read with getPublicUrl) — unlike the private 'clips' bucket. Only a channel admin may upload, into
-- their own user folder; size/type limits mirror 'clips'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('channel', 'channel', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only a channel admin, only into their own user-id folder.
create policy channel_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.channel_can_post()
  );
-- Read: the bucket is public (getPublicUrl), but allow authenticated API reads too.
create policy channel_files_read on storage.objects for select to authenticated
  using (bucket_id = 'channel');
-- Delete own files (e.g. when a post insert is rolled back).
create policy channel_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'channel' and (storage.foldername(name))[1] = (select auth.uid()::text));
