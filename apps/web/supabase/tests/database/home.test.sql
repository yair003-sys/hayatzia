-- Home redesign: likes on player reviews (exact counts, one per fan, own club, not your own, not empty, blocks),
-- the most-liked reviews per player, story seen-state from clip_views, and the club aggregates "active fans (7 days)"
-- and "fans of the week" (own club only, nick + points only).
begin;
select plan(65);

-- Likes part (mta): f1 author, f2 and f3 likers, f4 blocked by f1, f5 a rival (hta), f6 rated without words.
-- Aggregates part (mhf): g1..g4, g7..g10; g5 is a Beitar fan.
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-0000000000' || x)::uuid, 'authenticated', 'authenticated', x || '@test.local'
  from unnest(array['f1','f2','f3','f4','f5','f6','f7','f8','a1','a2','a3','a4','a5','a7','a8','a9','b0','e9']) x;
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'כותב', 'mta'),
  ('00000000-0000-0000-0000-0000000000f2', 'אוהב', 'mta'),
  ('00000000-0000-0000-0000-0000000000f3', 'שלישי', 'mta'),
  ('00000000-0000-0000-0000-0000000000f4', 'חסום', 'mta'),
  ('00000000-0000-0000-0000-0000000000f5', 'יריב', 'hta'),
  ('00000000-0000-0000-0000-0000000000f6', 'שקט', 'mta'),
  ('00000000-0000-0000-0000-0000000000f7', 'שביעי', 'mta'),
  ('00000000-0000-0000-0000-0000000000f8', 'שמיני', 'mta'),
  ('00000000-0000-0000-0000-0000000000a1', 'אלוף', 'mhf'),
  ('00000000-0000-0000-0000-0000000000a2', 'צלם', 'mhf'),
  ('00000000-0000-0000-0000-0000000000a3', 'מדרג', 'mhf'),
  ('00000000-0000-0000-0000-0000000000a4', 'ישן', 'mhf'),
  ('00000000-0000-0000-0000-0000000000a5', 'בייתרי', 'bei'),
  ('00000000-0000-0000-0000-0000000000a7', 'שופט', 'mhf'),
  ('00000000-0000-0000-0000-0000000000a8', 'כותבצאט', 'mhf'),
  ('00000000-0000-0000-0000-0000000000a9', 'שקטן', 'mhf'),
  ('00000000-0000-0000-0000-0000000000b0', 'מגיע', 'mhf');
-- e9 is signed in without a club.

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000' || p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.uid(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create function pg_temp.likes(p_player text, p_author text) returns integer language sql as $$
  select likes_count from public.player_ratings where player_id = p_player and user_id = pg_temp.uid(p_author)
$$;
create function pg_temp.like_rows(p_player text, p_author text) returns integer language sql as $$
  select count(*)::int from public.player_rating_likes where player_id = p_player and author_id = pg_temp.uid(p_author)
$$;

-- ── schema and privileges ──
select has_table('public', 'player_rating_likes', 'review likes table exists');
select col_is_pk('public', 'player_rating_likes', array['player_id', 'author_id', 'user_id'], 'one like per fan per review');
select has_column('public', 'player_ratings', 'likes_count', 'reviews carry a likes counter');
select ok(not has_column_privilege('authenticated', 'public.player_ratings', 'likes_count', 'update'), 'fans cannot set likes_count');
select ok(not has_column_privilege('authenticated', 'public.player_ratings', 'likes_count', 'insert'), 'fans cannot insert likes_count');
select ok(not has_column_privilege('authenticated', 'public.player_rating_likes', 'user_id', 'insert'), 'a like is always the caller''s');
select has_index('public', 'player_ratings', 'player_ratings_top_reviews_idx', 'index for the most-liked reviews per player');
select ok(not has_function_privilege('anon', 'public.home_active_fans(text)', 'execute'), 'anon cannot count active fans');
select ok(not has_function_privilege('anon', 'public.home_fans_of_week(text)', 'execute'), 'anon cannot read fans of the week');
select ok(not has_function_privilege('anon', 'public.home_player_reviews(integer)', 'execute'), 'anon cannot read top reviews');
select ok(not has_table_privilege('authenticated', 'public.clip_like_days', 'select'), 'weekly like tallies are internal');
set local role anon;
select throws_ok($$ select * from public.player_rating_likes $$, '42501', null, 'anon cannot read likes');
reset role;

-- ── reviews ──
select pg_temp.as_fan('f1');
set local role authenticated;
insert into public.player_ratings (player_id, stars, review) values ('mta_1', 5, 'קיר');
insert into public.blocks (blocked_id) values (pg_temp.uid('f4'));
reset role;
select pg_temp.as_fan('f6');
set local role authenticated;
insert into public.player_ratings (player_id, stars) values ('mta_1', 4);
reset role;
select pg_temp.as_fan('f3');
set local role authenticated;
insert into public.player_ratings (player_id, stars, review) values ('mta_14', 3, 'בסדר');
reset role;
select pg_temp.as_fan('f5');
set local role authenticated;
insert into public.player_ratings (player_id, stars, review) values ('hta_1', 5, 'מלך');
reset role;

-- ── likes: who may (Review Focus 1) ──
select pg_temp.as_fan('f2');
set local role authenticated;
select lives_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1')) $$,
  'a fan likes a teammate''s review');
select is(pg_temp.likes('mta_1', 'f1'), 1, 'likes_count is 1');
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1')) $$,
  '23505', null, 'one like per fan per review');
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f6')) $$,
  '42501', null, 'a rating without words cannot be liked');
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('hta_1', pg_temp.uid('f5')) $$,
  '42501', null, 'another club''s review cannot be liked');
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id, user_id) values ('mta_14', pg_temp.uid('f3'), pg_temp.uid('f3')) $$,
  '42501', null, 'a like cannot be made in someone else''s name');
select throws_ok($$ update public.player_ratings set likes_count = 99 $$, '42501', null, 'likes_count cannot be written by fans');
select is((select count(*)::int from public.player_rating_likes), 1, 'a fan reads only their own likes');
reset role;

select pg_temp.as_fan('f1');
set local role authenticated;
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1')) $$,
  '42501', null, 'your own review cannot be liked');
reset role;
select pg_temp.as_fan('f4');
set local role authenticated;
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1')) $$,
  '42501', null, 'a fan blocked by the author cannot like');
reset role;
select pg_temp.as_fan('f5');
set local role authenticated;
select throws_ok($$ insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1')) $$,
  '42501', null, 'a rival cannot like');
reset role;

-- ── likes: exact counts through like / unlike / re-like ──
select pg_temp.as_fan('f3');
set local role authenticated;
insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1'));
reset role;
select is(pg_temp.likes('mta_1', 'f1'), 2, 'a second fan: 2');

select pg_temp.as_fan('f2');
set local role authenticated;
delete from public.player_rating_likes where player_id = 'mta_1';
select is(pg_temp.likes('mta_1', 'f1'), 1, 'an unlike: 1');
delete from public.player_rating_likes where player_id = 'mta_1';
select is(pg_temp.likes('mta_1', 'f1'), 1, 'unliking twice changes nothing');
insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1'));
select is(pg_temp.likes('mta_1', 'f1'), 2, 'a re-like: 2');
reset role;
select pg_temp.as_fan('f3');
set local role authenticated;
delete from public.player_rating_likes;
reset role;
select is(pg_temp.likes('mta_1', 'f1'), 1, 'another fan''s unlike leaves the first like');

-- A like does not refresh the review's date (the 30-day window is about the words).
update public.player_ratings set updated_at = now() - interval '10 days' where player_id = 'mta_1' and user_id = pg_temp.uid('f1');
select pg_temp.as_fan('f3');
set local role authenticated;
insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1'));
reset role;
select is((select updated_at from public.player_ratings where player_id = 'mta_1' and user_id = pg_temp.uid('f1')),
  now() - interval '10 days', 'a like leaves updated_at alone');
select is(pg_temp.likes('mta_1', 'f1'), 2, 'likes: 2');

-- Changing only the stars keeps the likes; changing the words starts over.
select pg_temp.as_fan('f1');
set local role authenticated;
update public.player_ratings set stars = 4 where player_id = 'mta_1';
select is(pg_temp.likes('mta_1', 'f1'), 2, 'new stars, same words: likes kept');
reset role;
-- Updates of player_ratings so far in this transaction (the reset must add exactly one: the fan's own).
create temp table upd0 as
  select n_tup_upd from pg_stat_xact_user_tables where schemaname = 'public' and relname = 'player_ratings';
select pg_temp.as_fan('f1');
set local role authenticated;
update public.player_ratings set review = 'קיר בטון' where player_id = 'mta_1';
select is(pg_temp.likes('mta_1', 'f1'), 0, 'new words: likes start over');
reset role;
select is(pg_temp.like_rows('mta_1', 'f1'), 0, 'the old likes are gone');
select is((select s.n_tup_upd - u.n_tup_upd from pg_stat_xact_user_tables s, upd0 u
            where s.schemaname = 'public' and s.relname = 'player_ratings'), 1::bigint,
  'the reset zeroes the count in the fan''s own update: no per-like update of the review');
select results_eq($$ select sum, count from public.player_rating_stats where player_id = 'mta_1' $$, $$ values (8, 2) $$,
  'likes never touch the rating stats');

-- After a reset the count starts from zero; a liker's account deletion still counts down (a delete from inside a
-- trigger is not a reset).
select pg_temp.as_fan('f8');
set local role authenticated;
insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1'));
reset role;
select is(pg_temp.likes('mta_1', 'f1'), 1, 'a like after the reset: 1');
delete from auth.users where id = pg_temp.uid('f8');
select is(pg_temp.likes('mta_1', 'f1'), 0, 'the liker''s account deleted: 0');

-- Narrowed stamp trigger (regression guard): a stars-only update still restamps updated_at and the nick.
update public.player_ratings set updated_at = now() - interval '5 days' where player_id = 'mta_1' and user_id = pg_temp.uid('f6');
update public.profiles set nick = 'שקט מאוד' where user_id = pg_temp.uid('f6');
select pg_temp.as_fan('f6');
set local role authenticated;
update public.player_ratings set stars = 5 where player_id = 'mta_1';
reset role;
select results_eq($$ select updated_at = now(), nick::text from public.player_ratings
                     where player_id = 'mta_1' and user_id = pg_temp.uid('f6') $$,
  $$ values (true, 'שקט מאוד'::text) $$, 'new stars restamp updated_at and the nick');

-- Deleting a review takes its likes with it.
select pg_temp.as_fan('f2');
set local role authenticated;
insert into public.player_rating_likes (player_id, author_id) values ('mta_14', pg_temp.uid('f3'));
reset role;
select is(pg_temp.like_rows('mta_14', 'f3'), 1, 'f3''s review has a like');
select pg_temp.as_fan('f3');
set local role authenticated;
delete from public.player_ratings where player_id = 'mta_14';
reset role;
select is(pg_temp.like_rows('mta_14', 'f3'), 0, 'deleting the review deletes its likes');

-- ── the most-liked reviews per player ──
select pg_temp.as_fan('f2');
set local role authenticated;
insert into public.player_rating_likes (player_id, author_id) values ('mta_1', pg_temp.uid('f1'));
insert into public.player_ratings (player_id, stars, review) values ('mta_1', 3, 'חלש היום');
reset role;
select pg_temp.as_fan('f7');
set local role authenticated;
insert into public.player_ratings (player_id, stars, review) values ('mta_1', 2, 'ישן');
reset role;
update public.player_ratings set updated_at = now() - interval '31 days' where player_id = 'mta_1' and user_id = pg_temp.uid('f7');

select pg_temp.as_fan('f2');
set local role authenticated;
select results_eq($$ select nick::text, review::text, likes_count, liked from public.home_player_reviews(5) where player_id = 'mta_1' $$,
  $$ values ('כותב'::text, 'קיר בטון'::text, 1, true), ('אוהב'::text, 'חלש היום'::text, 0, false) $$,
  'top reviews: most liked first, only with words, only the last 30 days, with my like');
select is((select count(*)::int from public.home_player_reviews(1) where player_id = 'mta_1'), 1, 'limited per player');
reset role;
select pg_temp.as_fan('f4');
set local role authenticated;
select is((select count(*)::int from public.home_player_reviews(5) where author_id = pg_temp.uid('f1')), 0,
  'reviews by a fan who blocked me are hidden');
reset role;
select pg_temp.as_fan('f5');
set local role authenticated;
select is((select count(*)::int from public.home_player_reviews(5) where player_id like 'mta_%'), 0, 'rivals see none of our reviews');
select is((select count(*)::int from public.home_player_reviews(5)), 1, 'a fan sees their own club''s reviews');
reset role;

-- ── stories: seen-state is clip_views, per fan; club scoping ──
select col_is_pk('public', 'clip_views', array['clip_id', 'user_id'], 'clip_views is one row per (clip, fan)');
select pg_temp.as_fan('f1');
set local role authenticated;
insert into public.clips (media_path, kind, audience) values ('00000000-0000-0000-0000-0000000000f1/s.jpg', 'image', 'team');
reset role;
select pg_temp.as_fan('f2');
set local role authenticated;
insert into public.clip_views (clip_id) select id from public.clips where user_id = pg_temp.uid('f1');
select is((select count(*)::int from public.clips c where c.team_id = 'mta' and exists (select 1 from public.clip_views v where v.clip_id = c.id)),
  1, 'the story is seen by the fan who viewed it');
reset role;
select pg_temp.as_fan('f3');
set local role authenticated;
select is((select count(*)::int from public.clips c where c.team_id = 'mta' and exists (select 1 from public.clip_views v where v.clip_id = c.id)),
  0, 'and unseen by a teammate who did not');
reset role;
select pg_temp.as_fan('f5');
set local role authenticated;
select is((select count(*)::int from public.clips where team_id = 'mta'), 0, 'a club story is not visible to rivals');
reset role;

-- ── aggregates (mhf) ──
insert into public.api_teams (api_id, name) values (650, 'Maccabi Haifa'), (651, 'Beitar Jerusalem') on conflict (api_id) do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (91, 383, 2026, 'R1', now() + interval '1 day', 'NS', 650, 651),
  (92, 383, 2026, 'R1', now() + interval '1 day', 'NS', 650, 651),
  (93, 383, 2026, 'R1', now() + interval '1 day', 'NS', 650, 651);
insert into public.predictions (user_id, fixture_id, home_goals, away_goals) values
  (pg_temp.uid('a1'), 91, 2, 1),    -- exact: 3
  (pg_temp.uid('a2'), 91, 1, 0),    -- direction: 1
  (pg_temp.uid('a3'), 92, 0, 0);    -- exact, but the match was 10 days ago
update public.fixtures set kickoff_at = now() - interval '2 days', status = 'FT', home_goals = 2, away_goals = 1 where id = 91;
update public.fixtures set kickoff_at = now() - interval '10 days', status = 'FT', home_goals = 0, away_goals = 0 where id = 92;
update public.predictions set updated_at = now() - interval '10 days' where user_id = pg_temp.uid('a3');
select is((select points from public.predictions where user_id = pg_temp.uid('a1')), 3::smallint, 'a1 scored 3');

-- Ratings given: a1 two, a3 one, a7 two, a4 two but 8 days ago.
insert into public.player_ratings (player_id, user_id, stars, review) values
  ('mhf_40', pg_temp.uid('a1'), 5, ''), ('mhf_17', pg_temp.uid('a1'), 4, 'טוב'),
  ('mhf_40', pg_temp.uid('a3'), 3, ''),
  ('mhf_40', pg_temp.uid('a7'), 2, ''), ('mhf_17', pg_temp.uid('a7'), 2, ''),
  ('mhf_40', pg_temp.uid('a4'), 4, ''), ('mhf_17', pg_temp.uid('a4'), 4, '');
update public.player_ratings set updated_at = now() - interval '8 days' where user_id = pg_temp.uid('a4');

-- a2 posts a clip; a3, a4 and a Beitar fan like it, a2 likes their own (not counted).
select pg_temp.as_fan('a2');
set local role authenticated;
insert into public.clips (media_path, kind) values ('00000000-0000-0000-0000-0000000000a2/c.jpg', 'image');
insert into public.clip_likes (clip_id) select id from public.clips where user_id = pg_temp.uid('a2');
reset role;
select pg_temp.as_fan('a3');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips where user_id = pg_temp.uid('a2');
reset role;
select pg_temp.as_fan('a4');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips where user_id = pg_temp.uid('a2');
reset role;
select pg_temp.as_fan('a5');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips where user_id = pg_temp.uid('a2');
reset role;
select is((select likes from public.clip_like_days where user_id = pg_temp.uid('a2')), 3, 'likes received: 3 (own like not counted)');
-- …and takes it back, then likes again (exact).
select pg_temp.as_fan('a5');
set local role authenticated;
delete from public.clip_likes;
reset role;
select is((select likes from public.clip_like_days where user_id = pg_temp.uid('a2')), 2, 'an unlike counts down: 2');
select pg_temp.as_fan('a5');
set local role authenticated;
insert into public.clip_likes (clip_id) select id from public.clips where user_id = pg_temp.uid('a2');
reset role;
select is((select likes from public.clip_like_days where user_id = pg_temp.uid('a2')), 3, 'a re-like: 3');

-- Chat: a8 now, a9 eight days ago; a Beitar fan now. Check-in: b0.
insert into public.team_messages (user_id, body) values (pg_temp.uid('a8'), 'יאללה'), (pg_temp.uid('a9'), 'ישן'), (pg_temp.uid('a5'), 'בית״ר');
update public.team_messages set created_at = now() - interval '8 days' where user_id = pg_temp.uid('a9');
insert into public.checkins (user_id, fixture_id, team_id) values (pg_temp.uid('b0'), 93, 'mhf');

select pg_temp.as_fan('a1');
set local role authenticated;
select is(public.home_active_fans('mhf'), 6, 'active fans: chat, Square, predictions, ratings, check-ins in 7 days, each fan once');
select results_eq($$ select * from public.home_fans_of_week('mhf') $$,
  $$ values ('אלוף'::text, 5), ('צלם'::text, 4), ('שופט'::text, 2) $$,
  'fans of the week: top 3, nick and points only (predictions + ratings + likes received)');
select throws_ok($$ select public.home_active_fans('mta') $$, '42501', 'not_your_club', 'active fans: own club only');
select throws_ok($$ select * from public.home_fans_of_week('bei') $$, '42501', 'not_your_club', 'fans of the week: own club only');
select throws_ok($$ select public.home_active_fans(null) $$, '42501', 'not_your_club', 'a null club is refused');
reset role;
select pg_temp.as_fan('a5');
set local role authenticated;
select is(public.home_active_fans('bei'), 1, 'another club counts its own fans');
reset role;
select pg_temp.as_fan('e9');
set local role authenticated;
select throws_ok($$ select public.home_active_fans('mhf') $$, '42501', 'not_your_club', 'a fan without a club is refused');
select throws_ok($$ select public.home_active_fans(null) $$, '42501', 'not_your_club', 'a fan without a club cannot pass a null club');
select throws_ok($$ select * from public.home_fans_of_week(null) $$, '42501', 'not_your_club',
  'fans of the week: a fan without a club cannot pass a null club');
reset role;

-- The cleanup job deleting the clip keeps the week's likes (counted when they happened).
delete from public.clips where user_id = pg_temp.uid('a2');
select pg_temp.as_fan('a1');
set local role authenticated;
select is((select points from public.home_fans_of_week('mhf') where nick = 'צלם'), 4, 'likes survive the clip''s expiry');
reset role;
-- The service role (server-side cache) may read any club.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.home_active_fans('mhf'), 6, 'the service role reads a club''s count');
select results_eq($$ select * from public.home_fans_of_week('mhf') $$,
  $$ values ('אלוף'::text, 5), ('צלם'::text, 4), ('שופט'::text, 2) $$, 'the service role reads a club''s fans of the week');
reset role;

select * from finish();
rollback;
