-- Small invite-only encrypted groups (same club, ≤ 20 fans incl. pending invites, admin invites/removes/renames,
-- invites expire after 7 days), unread counters and previews for threads and groups, realtime topics.
begin;
select plan(80);

-- a, b, c, d, f, g: Maccabi Tel Aviv; e: Hapoel Tel Aviv; x01..x20: Maccabi fans for the 20-cap.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'd2@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'd3@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'd4@test.local'),
  ('00000000-0000-0000-0000-0000000000d5', 'authenticated', 'authenticated', 'd5@test.local'),
  ('00000000-0000-0000-0000-0000000000d6', 'authenticated', 'authenticated', 'd6@test.local'),
  ('00000000-0000-0000-0000-0000000000d7', 'authenticated', 'authenticated', 'd7@test.local');
insert into public.profiles (user_id, nick, team_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'אלף', 'mta'),
  ('00000000-0000-0000-0000-0000000000d2', 'בית', 'mta'),
  ('00000000-0000-0000-0000-0000000000d3', 'גימל', 'mta'),
  ('00000000-0000-0000-0000-0000000000d4', 'דלת', 'mta'),
  ('00000000-0000-0000-0000-0000000000d5', 'הא', 'hta'),
  ('00000000-0000-0000-0000-0000000000d6', 'וו', 'mta'),
  ('00000000-0000-0000-0000-0000000000d7', 'זיו', 'mta');
insert into auth.users (id, aud, role, email)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'authenticated', 'authenticated', 'x' || i || '@test.local'
  from generate_series(1, 20) i;
insert into public.profiles (user_id, nick, team_id)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'אוהד' || i, 'mta' from generate_series(1, 20) i;

create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;

-- ── structure ──
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'dm_group_messages'
  and column_name in ('body', 'text', 'plaintext', 'content')), 0, 'group messages have no plaintext column');
select ok(not has_column_privilege('authenticated', 'public.dm_group_messages', 'sender_id', 'insert'), 'the sender is stamped, never sent');
select ok(not has_table_privilege('authenticated', 'public.dm_group_members', 'update')
  and not has_table_privilege('authenticated', 'public.dm_group_members', 'delete')
  and not has_table_privilege('authenticated', 'public.dm_groups', 'update'), 'groups and members change through the RPCs only');
select ok((select qual from pg_policies where schemaname = 'realtime' and policyname = 'dm_channel_receive') like '%grp:%'
  and (select qual from pg_policies where schemaname = 'realtime' and policyname = 'dm_channel_receive') like '%dm:%'
  and (select qual from pg_policies where schemaname = 'realtime' and policyname = 'dm_channel_receive') like '%inbox:%',
  'realtime: group channels added, thread and inbox channels kept');

-- ── a opens a group with b and c ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ select set_config('t.g', public.create_group('  יציע צפוני ', array['00000000-0000-0000-0000-0000000000d2',
  '00000000-0000-0000-0000-0000000000d3']::uuid[])::text, true) $$, 'a fan opens a group with two teammates');
select is((select name::text from public.dm_groups where id = current_setting('t.g')::uuid), 'יציע צפוני', 'the name is trimmed');
select is((select role || ':' || (joined_at is not null) from public.dm_group_members
  where group_id = current_setting('t.g')::uuid and user_id = '00000000-0000-0000-0000-0000000000d1'), 'admin:true', 'the opener is the admin and joined');
select is((select count(*)::int from public.dm_group_members where group_id = current_setting('t.g')::uuid and role = 'invited' and joined_at is null),
  2, 'the others are invited, not added');
select is((select members_count from public.dm_groups where id = current_setting('t.g')::uuid), 1, 'pending invites are not members');
select throws_ok($$ select public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d5']::uuid[]) $$,
  'P0001', 'not_same_team', 'fans of other clubs cannot be invited');
select throws_ok($$ select public.create_group('א', array['00000000-0000-0000-0000-0000000000d2']::uuid[]) $$,
  'P0001', 'bad_name', 'a name needs 2–40 characters');
select throws_ok($$ select public.create_group(repeat('א', 41), array['00000000-0000-0000-0000-0000000000d2']::uuid[]) $$,
  'P0001', 'bad_name', 'a name of 41 characters is too long');
select throws_ok($$ insert into public.dm_groups (team_id, name, created_by) values ('mta', 'עוקפים', '00000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'groups cannot be inserted directly');
select throws_ok($$ insert into public.dm_group_members (group_id, user_id, role) values (current_setting('t.g')::uuid, '00000000-0000-0000-0000-0000000000d4', 'member') $$,
  '42501', null, 'members cannot be added directly');
reset role;

-- c (an invitee) blocked f: f cannot be invited while c is in the group.
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d3');
set local role authenticated;
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-0000000000d6');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select throws_ok($$ select public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d6']::uuid[]) $$,
  'P0001', 'blocked', 'no invite when a block exists with anyone in the group');

-- ── 20 fans at most, pending invites included ──
select lives_ok($$ select set_config('t.g2', public.create_group('עשרים', array(select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
  from generate_series(1, 19) i))::text, true) $$, '19 invitees and the admin make 20');
select throws_ok($$ select public.invite_to_group(current_setting('t.g2')::uuid, array['00000000-0000-0000-0000-0000000000d7']::uuid[]) $$,
  'P0001', 'group_full', 'the 21st fan does not fit');
select throws_ok($$ select public.create_group('יותר מדי', array(select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
  from generate_series(1, 20) i)) $$, 'P0001', 'group_full', 'at most 19 picked per call');
reset role;

-- ── b sees the invite (name and count only) and accepts ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select is((select members_count from public.dm_groups where id = current_setting('t.g')::uuid), 1, 'an invitee sees the group name and count');
select is((select count(*)::int from public.dm_group_members where group_id = current_setting('t.g')::uuid), 1, 'an invitee sees only their own invite row');
select throws_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev02bb', 'aXY=', 'eA==', '{}') $$, 'P0001', 'not_member', 'an invitee cannot write yet');
select lives_ok($$ select public.answer_invite(current_setting('t.g')::uuid, true) $$, 'b accepts the invite');
select is((select role || ':' || (joined_at is not null) from public.dm_group_members
  where group_id = current_setting('t.g')::uuid and user_id = '00000000-0000-0000-0000-0000000000d2'), 'member:true', 'b is a member from now');
select is((select count(*)::int from public.dm_group_events where group_id = current_setting('t.g')::uuid and kind = 'join'
  and subject = '00000000-0000-0000-0000-0000000000d2'), 1, 'a join line is recorded');
select is((select members_count from public.dm_groups where id = current_setting('t.g')::uuid), 2, 'the member count grows on accept');
select throws_ok($$ select public.answer_invite(current_setting('t.g')::uuid, true) $$, 'P0001', 'not_member', 'no invite to answer twice');
-- Only the admin invites, removes and renames.
select throws_ok($$ select public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d7']::uuid[]) $$,
  'P0001', 'not_admin', 'a member cannot invite');
select throws_ok($$ select public.remove_from_group(current_setting('t.g')::uuid, '00000000-0000-0000-0000-0000000000d1') $$,
  'P0001', 'not_admin', 'a member cannot remove');
select throws_ok($$ select public.rename_group(current_setting('t.g')::uuid, 'השתלטות') $$, 'P0001', 'not_admin', 'a member cannot rename');
reset role;

-- c declines: the invite is gone.
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d3');
set local role authenticated;
select lives_ok($$ select public.answer_invite(current_setting('t.g')::uuid, false) $$, 'c declines');
select is((select count(*)::int from public.dm_groups where id = current_setting('t.g')::uuid), 0, 'a declined group disappears for c');
reset role;
select is((select count(*)::int from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and user_id = '00000000-0000-0000-0000-0000000000d3'), 0, 'the declined invite row is deleted');

-- An invite older than 7 days has expired.
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ select public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d4']::uuid[]) $$, 'a invites d');
reset role;
update public.dm_group_members set invited_at = now() - interval '8 days'
  where group_id = current_setting('t.g')::uuid and user_id = '00000000-0000-0000-0000-0000000000d4';
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select throws_ok($$ select public.answer_invite(current_setting('t.g')::uuid, true) $$, 'P0001', 'invite_expired', 'an expired invite cannot be accepted');
select is((select count(*)::int from public.dm_groups where id = current_setting('t.g')::uuid), 0, 'an expired invite is no longer shown');
reset role;

-- ── messages ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select lives_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev02bb', 'aXY=', 'Y2lwaGVy', '{"dev01aa":{"i":"x","w":"y"},"dev02bb":{"i":"x","w":"y"}}') $$,
  'a member sends an encrypted group message');
select throws_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev02bb', 'aXY=', 'eA==', (select jsonb_object_agg('dev' || i, '{}'::jsonb) from generate_series(1, 61) i)) $$,
  '22023', null, 'at most 60 wrapped keys');
select throws_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev02bb', 'aXY=', 'eA==', jsonb_build_object('dev01aa', jsonb_build_object('i', 'x', 'w', repeat('w', 20000)))) $$,
  '23514', null, 'wrapped keys are capped in size');
reset role;
select is((select last_from from public.dm_groups where id = current_setting('t.g')::uuid), '00000000-0000-0000-0000-0000000000d2'::uuid,
  'the group shows who wrote last');
select is((select last_message_id from public.dm_groups where id = current_setting('t.g')::uuid),
  (select id from public.dm_group_messages where group_id = current_setting('t.g')::uuid), 'the group points at its last message for the preview');
select is((select string_agg(unread::text, ',' order by user_id) from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and role <> 'invited'), '1,0', 'unread grows for the others, not the sender');
-- a and b joined an hour ago and the message was sent a minute ago, before d joins.
update public.dm_group_members set joined_at = now() - interval '1 hour' where group_id = current_setting('t.g')::uuid and role <> 'invited';
update public.dm_group_messages set created_at = now() - interval '1 minute' where group_id = current_setting('t.g')::uuid;

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ select public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d4']::uuid[]) $$,
  'a can invite d again after the old invite expired');
select is((select count(*)::int from public.dm_group_messages where group_id = current_setting('t.g')::uuid), 1, 'the admin reads the message');
select lives_ok($$ select public.mark_read('group', current_setting('t.g')::uuid) $$, 'a marks the group read');
select is((select unread from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and user_id = '00000000-0000-0000-0000-0000000000d1'), 0, 'marking read zeroes the counter');
reset role;

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select lives_ok($$ select public.answer_invite(current_setting('t.g')::uuid, true) $$, 'd accepts the new invite');
select is((select count(*)::int from public.dm_group_messages where group_id = current_setting('t.g')::uuid), 0,
  'a new member does not read messages from before joining');
reset role;

select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d3');
set local role authenticated;
select is((select count(*)::int from public.dm_group_messages), 0, 'a fan who declined reads nothing');
select throws_ok($$ select public.mark_read('group', current_setting('t.g')::uuid) $$, 'P0001', 'not_member', 'outsiders cannot mark read');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select throws_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev05ee', 'aXY=', 'eA==', '{}') $$, 'P0001', 'not_member', 'outsiders cannot write');
reset role;

-- A block between members: the blocker stops receiving the blocked fan's messages.
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev01aa', 'aXY=', 'eQ==', '{}') $$, 'the admin writes');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select is((select count(*)::int from public.dm_group_messages), 1, 'd reads messages sent after joining');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select is((select count(*)::int from public.group_push_targets(current_setting('t.g')::uuid)), 2, 'a new message notifies the other members');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.dm_group_messages), 0, 'd no longer reads a''s messages after blocking a');
select lives_ok($$ select public.mute_group(current_setting('t.g')::uuid, true) $$, 'd mutes the group');
select is((select muted from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and user_id = '00000000-0000-0000-0000-0000000000d4'), true, 'muted is saved on d''s membership');
reset role;
-- d blocked a: a's next message does not bump d's unread.
select set_config('t.du', (select unread::text from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and user_id = '00000000-0000-0000-0000-0000000000d4'), true);
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev01aa', 'aXY=', 'eg==', '{}');
reset role;
select is((select unread from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and user_id = '00000000-0000-0000-0000-0000000000d4'), current_setting('t.du')::int, 'a blocked fan''s message does not count as unread for the blocker');

-- The other direction: b blocks a. a (the blocked one) reads none of b's messages and is not counted.
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev02bb', 'aXY=', 'dw==', '{}') $$, 'b writes after blocking a');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select is((select count(*)::int from public.dm_group_messages where sender_id = '00000000-0000-0000-0000-0000000000d2'), 0,
  'a fan who was blocked reads none of the blocker''s messages');
select is((select count(*)::int from public.group_push_targets(current_setting('t.g')::uuid)), 0,
  'no push to a fan with a block either way, nor to one who muted the group');
reset role;
select is((select unread from public.dm_group_members where group_id = current_setting('t.g')::uuid
  and user_id = '00000000-0000-0000-0000-0000000000d1'), 0, 'the blocker''s message does not count as unread for the blocked fan');

-- ── remove, rename, leave ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ select public.remove_from_group(current_setting('t.g')::uuid, '00000000-0000-0000-0000-0000000000d2') $$, 'the admin removes b');
select is((select count(*)::int from public.dm_group_events where group_id = current_setting('t.g')::uuid and kind = 'remove'
  and subject = '00000000-0000-0000-0000-0000000000d2'), 1, 'a removal line is recorded');
select lives_ok($$ select public.rename_group(current_setting('t.g')::uuid, 'שער 11') $$, 'the admin renames');
select is((select name::text || ':' || (select count(*) from public.dm_group_events e where e.group_id = g.id and e.kind = 'rename')
  from public.dm_groups g where id = current_setting('t.g')::uuid), 'שער 11:1', 'the new name and a rename line');
-- The admin invites g, then cancels the invite.
select is(public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d7']::uuid[]),
  array['00000000-0000-0000-0000-0000000000d7']::uuid[], 'an invite returns the fans actually invited');
select is(public.invite_to_group(current_setting('t.g')::uuid, array['00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000d4']::uuid[]),
  '{}'::uuid[], 'fans already invited or in the group are skipped');
select lives_ok($$ select public.remove_from_group(current_setting('t.g')::uuid, '00000000-0000-0000-0000-0000000000d7') $$, 'the admin cancels an invite');
reset role;
select is((select count(*)::int from public.dm_group_members where group_id = current_setting('t.g')::uuid and user_id = '00000000-0000-0000-0000-0000000000d7')
  + (select count(*)::int from public.dm_group_events where group_id = current_setting('t.g')::uuid and subject = '00000000-0000-0000-0000-0000000000d7'),
  0, 'a cancelled invite is gone and leaves no system line');
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select is((select count(*)::int from public.dm_group_events), 0, 'an outsider reads no events');
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select is((select count(*)::int from public.dm_group_messages), 0, 'a removed fan reads nothing');
select throws_ok($$ insert into public.dm_group_messages (group_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.g')::uuid, 'dev02bb', 'aXY=', 'eA==', '{}') $$, 'P0001', 'not_member', 'a removed fan cannot write');
reset role;

-- In the 20 group, two invitees join; the admin leaves and the earliest-joined member becomes admin.
select pg_temp.as_fan('00000000-0000-0000-0000-000000000101');
set local role authenticated;
select public.answer_invite(current_setting('t.g2')::uuid, true);
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-000000000102');
set local role authenticated;
select public.answer_invite(current_setting('t.g2')::uuid, true);
reset role;
update public.dm_group_members set joined_at = now() - interval '1 hour'
  where group_id = current_setting('t.g2')::uuid and user_id = '00000000-0000-0000-0000-000000000102';
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select lives_ok($$ select public.leave_group(current_setting('t.g2')::uuid) $$, 'the admin leaves');
reset role;
select is((select user_id from public.dm_group_members where group_id = current_setting('t.g2')::uuid and role = 'admin'),
  '00000000-0000-0000-0000-000000000102'::uuid, 'the earliest-joined member becomes admin');
select is((select count(*)::int from public.dm_group_events where group_id = current_setting('t.g2')::uuid and kind = 'leave'), 1, 'a leave line is recorded');

-- The last members leave: the group is deleted.
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select public.leave_group(current_setting('t.g')::uuid);
reset role;
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select lives_ok($$ select public.leave_group(current_setting('t.g')::uuid) $$, 'the last member leaves');
reset role;
select is((select count(*)::int from public.dm_groups where id = current_setting('t.g')::uuid), 0, 'an empty group is deleted');

-- ── 1:1 threads: preview pointer and unread counters ──
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
insert into public.dm_threads (user_a, user_b) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d7');
insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  select id, 'dev01aa', 'aXY=', 'eA==', '{}' from public.dm_threads;
reset role;
select is((select (last_message_id = (select id from public.dm_messages m where m.thread_id = t.id))::text || ':' || unread_a || ':' || unread_b
  from public.dm_threads t where t.user_b = '00000000-0000-0000-0000-0000000000d7'), 'true:0:1', 'a thread message sets the preview and the other side''s unread');
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d7');
set local role authenticated;
select public.mark_read('dm', (select id from public.dm_threads));
reset role;
select is((select unread_b from public.dm_threads where user_b = '00000000-0000-0000-0000-0000000000d7'), 0, 'marking a thread read zeroes the reader''s counter');
select pg_temp.as_fan('00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select throws_ok($$ select public.mark_read('dm', '00000000-0000-0000-0000-000000000000') $$, 'P0001', 'not_member', 'only thread members mark read');
reset role;

select * from finish();
rollback;
