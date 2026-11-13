-- Song Greenhouse (2026-11-14): a fan posts a song to their club's greenhouse; club + author + nick are
-- server-stamped; audio must sit in the author's own folder; only the club sees/likes/adopts it; likes and
-- adopts are counted by triggers; posting is rate-limited; a fan deletes only their own song.
begin;
select plan(14);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, 'authenticated', 'authenticated', 'song_author@test.local'),
  ('00000000-0000-0000-0000-0000000000d2'::uuid, 'authenticated', 'authenticated', 'song_fan2@test.local'),
  ('00000000-0000-0000-0000-0000000000d3'::uuid, 'authenticated', 'authenticated', 'song_rival@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, 'כותב', 'mta'),
  ('00000000-0000-0000-0000-0000000000d2'::uuid, 'אוהד2', 'mta'),
  ('00000000-0000-0000-0000-0000000000d3'::uuid, 'יריב', 'hta');

-- ===== the author posts a song: club + nick stamped, counters zero =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.songs (audio_path, title, lyrics)
     values ('00000000-0000-0000-0000-0000000000d1/a.webm', 'ההמנון שלנו', 'קדימה אלופים נשיר ביחד') $$,
  'a fan posts a song to the greenhouse');
select is((select team_id from public.songs where user_id = '00000000-0000-0000-0000-0000000000d1'::uuid), 'mta',
  'the song club is stamped from the author''s club');
select is((select nick from public.songs where user_id = '00000000-0000-0000-0000-0000000000d1'::uuid), 'כותב',
  'the author nick is stamped');
select is((select adopts_count + likes_count from public.songs where user_id = '00000000-0000-0000-0000-0000000000d1'::uuid), 0,
  'counters start at zero');
-- audio must live in the author's own folder
select throws_ok(
  $$ insert into public.songs (audio_path, title, lyrics)
     values ('00000000-0000-0000-0000-0000000000d3/steal.webm', 'x', 'y') $$,
  '42501', null, 'cannot post audio from another fan''s folder');
-- stash the song id so the rival can try to adopt a song they are not allowed to see
select set_config('test.song_id', (select id::text from public.songs where user_id = '00000000-0000-0000-0000-0000000000d1'::uuid), false);
reset role;

-- ===== a rival club cannot see the song; a club-mate can =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.songs)::int, 0, 'a rival club does not see the greenhouse song');
-- a rival cannot adopt it either (its RLS hides it, so the WITH CHECK fails)
select throws_ok(
  $$ insert into public.song_adopts (song_id) values (current_setting('test.song_id')::uuid) $$,
  null, null, 'a rival cannot adopt a song from another club');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.songs)::int, 1, 'a club-mate sees the greenhouse song');

-- ===== like + adopt are counted by triggers =====
insert into public.song_likes (song_id) select id from public.songs limit 1;
select is((select likes_count from public.songs limit 1), 1, 'a like bumps likes_count');
insert into public.song_adopts (song_id) select id from public.songs limit 1;
select is((select adopts_count from public.songs limit 1), 1, 'an adopt bumps adopts_count');
-- un-adopt decrements
delete from public.song_adopts where user_id = '00000000-0000-0000-0000-0000000000d2'::uuid;
select is((select adopts_count from public.songs limit 1), 0, 'un-adopting decrements the counter');
reset role;

-- ===== a fan deletes only their own song =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
delete from public.songs;  -- RLS: fan2 is not the author, so 0 rows
select is((select count(*) from public.songs)::int, 1, 'a fan cannot delete another fan''s song');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ delete from public.songs where user_id = '00000000-0000-0000-0000-0000000000d1'::uuid $$,
  'the author deletes their own song');
select is((select count(*) from public.songs)::int, 0, 'the song is gone');
reset role;

select * from finish();
rollback;
