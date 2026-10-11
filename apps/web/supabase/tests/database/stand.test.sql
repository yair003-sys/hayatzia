-- The stand: team-private photos and player ratings.
begin;
select plan(15);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'authenticated', 'authenticated', 'a7@test.local'),
  ('00000000-0000-0000-0000-0000000000b7', 'authenticated', 'authenticated', 'b7@test.local'),
  ('00000000-0000-0000-0000-0000000000c7', 'authenticated', 'authenticated', 'c7@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a7', 'אחד', 'mta'),
  ('00000000-0000-0000-0000-0000000000b7', 'שניים', 'mta'),
  ('00000000-0000-0000-0000-0000000000c7', 'שלושה', 'hta');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.team_photos (media_path, caption) values ('00000000-0000-0000-0000-0000000000a7/p.jpg', 'מהיציע') $$,
  'a fan posts a stand photo');
select lives_ok($$ insert into public.player_ratings (player_id, stars, review) values ('mta_1', 5, 'קיר') $$, 'rate own club''s player');
select throws_ok($$ insert into public.player_ratings (player_id, stars) values ((select id from public.players where team_id = 'hta' limit 1), 1) $$,
  '42501', 'not_your_player', 'cannot rate another club''s player');
select throws_ok($$ insert into public.player_ratings (player_id, stars) values ('mta_14', 6) $$, '23514', null, 'stars are 1 to 5');
select lives_ok($$ update public.player_ratings set stars = 3 where player_id = 'mta_1' $$, 'change your rating');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.team_photos), 1, 'teammates see the stand photos');
select lives_ok($$ insert into public.team_photo_likes (photo_id) select id from public.team_photos $$, 'a teammate likes it');
select lives_ok($$ insert into public.team_photo_comments (photo_id, body) select id, 'אש' from public.team_photos $$, 'a teammate comments');
select lives_ok($$ insert into public.player_ratings (player_id, stars) values ('mta_1', 4) $$, 'a teammate rates too');
select results_eq($$ select sum, count, d3, d4, d5 from public.player_rating_stats where player_id = 'mta_1' $$,
  $$ values (7, 2, 1, 1, 0) $$, 'stats follow inserts and updates');
select is((select count(*)::int from public.player_ratings where player_id = 'mta_1'), 2, 'teammates read the reviews');
select throws_ok($$ update public.player_ratings set user_id = '00000000-0000-0000-0000-0000000000a7' where player_id = 'mta_1' $$,
  '42501', null, 'a rating cannot be moved to someone else');
reset role;

select results_eq($$ select likes_count, comments_count from public.team_photos $$, $$ values (1, 1) $$, 'photo counters kept by triggers');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.team_photos), 0, 'other clubs do not see the stand');
select is((select count(*)::int from public.player_rating_stats), 0, 'other clubs do not see the ratings');
reset role;

select * from finish();
rollback;
