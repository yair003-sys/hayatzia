-- Team chat security: team-private reads, server-stamped writes, rate limit.
begin;
select plan(11);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'd1@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'צהוב', 'mta'),
  ('00000000-0000-0000-0000-0000000000c1', 'אדום', 'hta');
-- d1 signed in but never finished onboarding (no profile).

-- Fan of Maccabi writes; only the text is sent.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.team_messages (body) values ('  יאללה מכבי  ') $$, 'a fan posts to their team chat');
select results_eq($$ select team_id, nick::text, body::text from public.team_messages $$,
  $$ values ('mta'::text, 'צהוב'::text, 'יאללה מכבי'::text) $$, 'server stamps club, nickname and trims the text');
select throws_ok($$ insert into public.team_messages (body, team_id) values ('פלישה', 'hta') $$,
  '42501', null, 'a fan cannot choose the club');
select throws_ok($$ insert into public.team_messages (body, nick) values ('התחזות', 'מנהל') $$,
  '42501', null, 'a fan cannot choose the nickname');
select throws_ok($$ insert into public.team_messages (body) values ('   ') $$, '23514', null, 'empty messages are rejected');
select lives_ok($$ insert into public.team_messages (body) select 'הודעה ' || g from generate_series(1, 4) g $$, 'up to 5 messages in 10 seconds');
select throws_ok($$ insert into public.team_messages (body) values ('ספאם') $$, 'P0001', 'rate_limit', 'the 6th message in 10 seconds is blocked');
reset role;

-- Fan of Hapoel sees nothing of Maccabi's chat.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.team_messages), 0, 'other clubs cannot read the chat');
reset role;

-- Signed in without a profile: cannot post.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ insert into public.team_messages (body) values ('היי') $$, '42501', null, 'no profile, no chat');
reset role;

set local role anon;
select throws_ok($$ select * from public.team_messages $$, '42501', null, 'anon cannot read team chats');
reset role;

select is((select count(*)::int from pg_policies where schemaname = 'realtime' and policyname = 'team_channel_receive'),
  1, 'realtime channel is restricted to the fan''s club');

select * from finish();
rollback;
