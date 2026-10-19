-- Phase 3: behavioural content-type affinity. A trigger on the engagement tables bumps the fan's own aggregate
-- counter (image vs video) with a slow time-decay — no raw event log, no content, and never for engaging with one's
-- own post. A fan may read only their own counters (RLS).
begin;
select plan(6);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a1@test.local'), -- author
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'ea@test.local'); -- engager
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'יוצר', 'mta'),
  ('00000000-0000-0000-0000-0000000000e1', 'צופה', 'mta');

-- Two clips by the author: one video, one image, plus a second video for the decay check.
insert into public.clips (id, user_id, team_id, media_path, kind) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 'mta', '00000000-0000-0000-0000-0000000000a1/v1.mp4', 'video'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000a1', 'mta', '00000000-0000-0000-0000-0000000000a1/i1.jpg', 'image'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000a1', 'mta', '00000000-0000-0000-0000-0000000000a1/v2.mp4', 'video');

-- The author engaging with their own clip must NOT create a taste signal.
insert into public.clip_likes (clip_id, user_id) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1');

-- The engager: likes + respects the video (weight 1 each → 2), comments on the image (weight 2 → 2).
insert into public.clip_likes    (clip_id, user_id) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e1');
insert into public.clip_respects (clip_id, user_id) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000e1');
insert into public.clip_comments (clip_id, user_id, team_id, nick, body)
  values ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000e1', 'mta', 'צופה', 'יפה');

select is(
  (select round(score::numeric, 3) from public.fan_affinity
   where user_id = '00000000-0000-0000-0000-0000000000e1' and dim = 'kind' and key = 'video'),
  2.000, 'like + respect on a video → video affinity 2');
select is(
  (select round(score::numeric, 3) from public.fan_affinity
   where user_id = '00000000-0000-0000-0000-0000000000e1' and dim = 'kind' and key = 'image'),
  2.000, 'a comment on an image → image affinity 2 (comment weighs double)');
select is(
  (select count(*)::int from public.fan_affinity where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'engaging with your own post creates no affinity');

-- RLS: a fan reads only their own counters.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.fan_affinity), 2, 'the engager sees their own two counters');
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.fan_affinity), 0, 'another fan sees none of them');
reset role;

-- Decay: an old counter halves over one half-life (14 days) before the new weight is added.
update public.fan_affinity set score = 4, updated_at = now() - interval '14 days'
  where user_id = '00000000-0000-0000-0000-0000000000e1' and dim = 'kind' and key = 'video';
insert into public.clip_respects (clip_id, user_id) values ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000e1');
select ok(
  (select abs(score - 3.0) < 0.05 from public.fan_affinity
   where user_id = '00000000-0000-0000-0000-0000000000e1' and dim = 'kind' and key = 'video'),
  'a 14-day-old score of 4 decays to ~2, then +1 for the new respect → ~3');

select * from finish();
rollback;
