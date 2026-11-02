-- Channel media bucket (2026-11-01): public, 50MB limit, same media types as clips.
begin;
select plan(2);

select is((select public from storage.buckets where id = 'channel'), true, 'the channel bucket is public (CDN)');
select is((select file_size_limit from storage.buckets where id = 'channel'), 52428800::bigint, 'the channel bucket caps at 50MB');

select * from finish();
rollback;
