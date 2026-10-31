-- Emoji reactions on team-chat messages (2026-11-01): any emoji, one per fan, counts kept on the message as a jsonb,
-- writes limited to the fan's own row and own club. Replaces the old like/dislike (kind) model.
begin;
select plan(8);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'ra1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'ra2@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'rc1@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000a2', 'כחול', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'אדום', 'hta');

-- a1 posts a message to the Maccabi chat.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.team_messages (body) values ('גול!');
reset role;
create temp table _m as select id from public.team_messages limit 1;

-- ===== schema =====
select has_column('public', 'message_reactions', 'emoji', 'a reaction stores an emoji');
select hasnt_column('public', 'message_reactions', 'kind', 'the old kind column is gone');
select has_column('public', 'team_messages', 'reactions', 'the message carries a reactions jsonb');

-- ===== a fan reacts; counts land on the message =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.message_reactions (message_id, emoji) select id, '❤️' from _m $$, 'a fan reacts with an emoji');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
insert into public.message_reactions (message_id, emoji) select id, '🔥' from _m;
reset role;
select is((select t.reactions from public.team_messages t, _m where t.id = _m.id), '{"❤️": 1, "🔥": 1}'::jsonb,
  'the message counts both reactions');

-- ===== a rival-club fan cannot react to our message =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.message_reactions (message_id, emoji) select id, '👎' from _m $$,
  '42501', null, 'a rival-club fan cannot react to our message');
reset role;

-- ===== switching my emoji moves the count; removing it drops it (RLS: only my own row) =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update public.message_reactions set emoji = '👏' where message_id = (select id from _m);
select is((select t.reactions from public.team_messages t, _m where t.id = _m.id), '{"🔥": 1, "👏": 1}'::jsonb,
  'switching my emoji moves the count');
delete from public.message_reactions where message_id = (select id from _m);
select is((select t.reactions from public.team_messages t, _m where t.id = _m.id), '{"🔥": 1}'::jsonb,
  'removing my reaction leaves the other fan''s');
reset role;

select * from finish();
rollback;
