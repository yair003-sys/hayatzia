-- Replies (migration 20261015160000_chat_replies): public chats stamp a snapshot of the replied message (nick + first
-- 80 characters of the moderated text) and only accept a message of the same chat; private messages and groups take
-- only the id, which must be in the same thread / group.
begin;
select plan(27);

-- f1, f2, f3, f4: Maccabi Tel Aviv; f5: Hapoel Tel Aviv.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'f1@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'f2@test.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'f3@test.local'),
  ('00000000-0000-0000-0000-0000000000f4', 'authenticated', 'authenticated', 'f4@test.local'),
  ('00000000-0000-0000-0000-0000000000f5', 'authenticated', 'authenticated', 'f5@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000f2', 'כחול', 'mta'),
  ('00000000-0000-0000-0000-0000000000f3', 'לבן', 'mta'),
  ('00000000-0000-0000-0000-0000000000f4', 'שחור', 'mta'),
  ('00000000-0000-0000-0000-0000000000f5', 'אדום', 'hta');

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000' || p, 'role', 'authenticated')::text, true)
$$;

-- ── structure ──
select ok(has_column_privilege('authenticated', 'public.team_messages', 'reply_to', 'insert')
  and has_column_privilege('authenticated', 'public.match_messages', 'reply_to', 'insert')
  and has_column_privilege('authenticated', 'public.dm_messages', 'reply_to', 'insert')
  and has_column_privilege('authenticated', 'public.dm_group_messages', 'reply_to', 'insert'), 'fans may send reply_to');
select ok(not has_column_privilege('authenticated', 'public.team_messages', 'reply_nick', 'insert')
  and not has_column_privilege('authenticated', 'public.team_messages', 'reply_body', 'insert')
  and not has_column_privilege('authenticated', 'public.match_messages', 'reply_nick', 'insert')
  and not has_column_privilege('authenticated', 'public.match_messages', 'reply_body', 'insert'), 'the snapshot is never granted');
select ok(not has_function_privilege('authenticated', 'public.chat_reply_stamp()', 'execute')
  and not has_function_privilege('anon', 'public.chat_reply_stamp()', 'execute')
  and not has_function_privilege('authenticated', 'public.dm_reply_check()', 'execute')
  and not has_function_privilege('anon', 'public.dm_reply_check()', 'execute'), 'the trigger functions are closed to fans');

-- ── team chat ──
select pg_temp.as_fan('f1');
set local role authenticated;
insert into public.team_messages (body) values ('איזה חרא של משחק');
insert into public.team_messages (body) values (repeat('אבגדה', 24));
reset role;
select pg_temp.as_fan('f5');
set local role authenticated;
insert into public.team_messages (body) values ('הפועל');
reset role;
select set_config('t.m1', (select id::text from public.team_messages where body like 'איזה%'), true);
select set_config('t.m2', (select id::text from public.team_messages where body like 'אבגדה%'), true);
select set_config('t.h1', (select id::text from public.team_messages where body = 'הפועל'), true);

select pg_temp.as_fan('f2');
set local role authenticated;
select lives_ok(format($$ insert into public.team_messages (body, reply_to) values ('נכון', %L) $$, current_setting('t.m1')),
  'a fan replies to a message of their club');
select results_eq($$ select reply_nick::text, reply_body::text from public.team_messages where body = 'נכון' $$,
  $$ values ('צהוב'::text, 'איזה *** של משחק'::text) $$, 'the server stamps the nick and the moderated text');
select lives_ok(format($$ insert into public.team_messages (body, reply_to) values ('ארוך', %L) $$, current_setting('t.m2')),
  'a reply to a long message');
select is((select char_length(reply_body) from public.team_messages where body = 'ארוך'), 80, 'the snapshot keeps the first 80 characters');
select is((select reply_body::text from public.team_messages where body = 'ארוך'), left(repeat('אבגדה', 24), 80), 'from the start of the text');
select lives_ok($$ insert into public.team_messages (body) values ('בלי ציטוט') $$, 'a message without a reply works as before');
select is((select (reply_to is null and reply_nick is null and reply_body is null)::text from public.team_messages where body = 'בלי ציטוט'),
  'true', 'and carries no snapshot');
reset role;

select pg_temp.as_fan('f3');
set local role authenticated;
select throws_ok(format($$ insert into public.team_messages (body, reply_to) values ('פלישה', %L) $$, current_setting('t.h1')),
  '23503', 'bad_reply', 'replying to a message of another club is refused');
select throws_ok($$ insert into public.team_messages (body, reply_to) values ('רפאים', gen_random_uuid()) $$,
  '23503', 'bad_reply', 'replying to a message that does not exist is refused');
select throws_ok(format($$ insert into public.team_messages (body, reply_to, reply_nick) values ('זיוף', %L, 'מנהל') $$, current_setting('t.m1')),
  '42501', null, 'a fan cannot set the quoted nick');
select throws_ok(format($$ insert into public.team_messages (body, reply_to, reply_body) values ('זיוף', %L, 'משהו אחר') $$, current_setting('t.m1')),
  '42501', null, 'a fan cannot set the quoted text');
reset role;

-- Even the service side cannot plant a snapshot: the trigger overwrites it.
insert into public.team_messages (user_id, body, reply_nick, reply_body)
  values ('00000000-0000-0000-0000-0000000000f4', 'שתול', 'מנהל', 'טקסט מזויף');
select is((select (reply_nick is null and reply_body is null)::text from public.team_messages where body = 'שתול'), 'true',
  'a snapshot without a replied message is cleared');

-- ── match rooms ──
insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv');
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id) values
  (71, 383, 2026, 'R1', now() + interval '10 minutes', 'NS', 604, 4486),
  (72, 383, 2026, 'R2', now() + interval '10 minutes', 'NS', 604, 4486);

select pg_temp.as_fan('f4');
set local role authenticated;
insert into public.match_messages (fixture_id, body) values (71, 'יאללה צהוב');
insert into public.match_messages (fixture_id, body) values (72, 'משחק אחר');
reset role;
select set_config('t.x1', (select id::text from public.match_messages where fixture_id = 71), true);
select set_config('t.x2', (select id::text from public.match_messages where fixture_id = 72), true);

select pg_temp.as_fan('f5');
set local role authenticated;
select lives_ok(format($$ insert into public.match_messages (fixture_id, body, reply_to) values (71, 'נראה', %L) $$, current_setting('t.x1')),
  'a fan of the other side replies in the same room');
select results_eq($$ select reply_nick::text, reply_body::text from public.match_messages where body = 'נראה' $$,
  $$ values ('שחור'::text, 'יאללה צהוב'::text) $$, 'the room reply is stamped too');
select throws_ok(format($$ insert into public.match_messages (fixture_id, body, reply_to) values (71, 'בלבול', %L) $$, current_setting('t.x2')),
  '23503', 'bad_reply', 'replying to a message of another match is refused');
select throws_ok(format($$ insert into public.match_messages (fixture_id, body, reply_to) values (71, 'ערבוב', %L) $$, current_setting('t.h1')),
  '23503', 'bad_reply', 'a team-chat message cannot be quoted in a room');
select throws_ok(format($$ insert into public.match_messages (fixture_id, body, reply_to, reply_body) values (71, 'זיוף', %L, 'שקר') $$, current_setting('t.x1')),
  '42501', null, 'a fan cannot set the quoted text in a room');
reset role;

-- ── private messages ──
select pg_temp.as_fan('f1');
set local role authenticated;
insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3');
insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  select id, 'devf1', 'aXY=', 'eA==', '{}' from public.dm_threads;
reset role;
select set_config('t.d1', (select m.id::text from public.dm_messages m join public.dm_threads t on t.id = m.thread_id
  where t.user_b = '00000000-0000-0000-0000-0000000000f2'), true);
select set_config('t.d2', (select m.id::text from public.dm_messages m join public.dm_threads t on t.id = m.thread_id
  where t.user_b = '00000000-0000-0000-0000-0000000000f3'), true);

select pg_temp.as_fan('f2');
set local role authenticated;
select lives_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys, reply_to)
  select id, 'devf2', 'aXY=', 'eQ==', '{}', %L::uuid from public.dm_threads $$, current_setting('t.d1')), 'a reply in the same private thread');
select is((select count(*)::int from public.dm_messages where reply_to = current_setting('t.d1')::uuid), 1, 'the reply keeps the id only');
select throws_ok(format($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys, reply_to)
  select id, 'devf2', 'aXY=', 'eQ==', '{}', %L::uuid from public.dm_threads $$, current_setting('t.d2')),
  '23503', 'bad_reply', 'replying to a message of another thread is refused');
select lives_ok($$ insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  select id, 'devf2', 'aXY=', 'eg==', '{}' from public.dm_threads $$, 'a private message without a reply works as before');
reset role;

-- ── groups ──
insert into public.dm_groups (id, team_id, name, created_by) values
  ('00000000-0000-0000-0000-00000000a0f1', 'mta', 'קבוצה אחת', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000000a0f2', 'mta', 'קבוצה שתיים', '00000000-0000-0000-0000-0000000000f1');
insert into public.dm_group_members (group_id, user_id, role, joined_at) values
  ('00000000-0000-0000-0000-00000000a0f1', '00000000-0000-0000-0000-0000000000f1', 'admin', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000a0f1', '00000000-0000-0000-0000-0000000000f2', 'member', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000a0f1', '00000000-0000-0000-0000-0000000000f4', 'member', now() + interval '1 minute'),
  ('00000000-0000-0000-0000-00000000a0f2', '00000000-0000-0000-0000-0000000000f1', 'admin', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000a0f2', '00000000-0000-0000-0000-0000000000f3', 'member', now() - interval '1 hour');

select pg_temp.as_fan('f1');
set local role authenticated;
insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys) values
  ('00000000-0000-0000-0000-00000000a0f1', 'devf1', 'aXY=', 'eA==', '{}'),
  ('00000000-0000-0000-0000-00000000a0f2', 'devf1', 'aXY=', 'eA==', '{}');
reset role;
select set_config('t.g1', (select id::text from public.dm_group_messages where group_id = '00000000-0000-0000-0000-00000000a0f1'), true);
select set_config('t.g2', (select id::text from public.dm_group_messages where group_id = '00000000-0000-0000-0000-00000000a0f2'), true);

select pg_temp.as_fan('f2');
set local role authenticated;
select lives_ok(format($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys, reply_to)
  values ('00000000-0000-0000-0000-00000000a0f1', 'devf2', 'aXY=', 'eQ==', '{}', %L) $$, current_setting('t.g1')), 'a reply in the same group');
select throws_ok(format($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys, reply_to)
  values ('00000000-0000-0000-0000-00000000a0f1', 'devf2', 'aXY=', 'eQ==', '{}', %L) $$, current_setting('t.g2')),
  '23503', 'bad_reply', 'replying to a message of another group is refused');
reset role;

select pg_temp.as_fan('f4');
set local role authenticated;
select throws_ok(format($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys, reply_to)
  values ('00000000-0000-0000-0000-00000000a0f1', 'devf4', 'aXY=', 'eQ==', '{}', %L) $$, current_setting('t.g1')),
  '23503', 'bad_reply', 'a member cannot quote a message from before they joined');
reset role;

select * from finish();
rollback;
