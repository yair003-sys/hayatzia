-- Moderation screen (20261015180000_moderation_admin): only admins see and act on reports; previews never show private
-- messages; removing content handles its reports; a suspension stops every write path and ends on time; an admin is
-- never suspended; a report outlives its reporter's account; logged-out visitors run nothing new.
begin;
select plan(64);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-000000000' || p)::uuid
$$;
create function pg_temp.as_fan(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true)
$$;

insert into auth.users (id, aud, role, email) values
  (pg_temp.uid('e91'), 'authenticated', 'authenticated', 'e91@test.local'),
  (pg_temp.uid('e92'), 'authenticated', 'authenticated', 'e92@test.local'),
  (pg_temp.uid('e93'), 'authenticated', 'authenticated', 'e93@test.local'),
  (pg_temp.uid('e94'), 'authenticated', 'authenticated', 'e94@test.local'),
  (pg_temp.uid('e95'), 'authenticated', 'authenticated', 'e95@test.local');
insert into public.profiles (user_id, nick, team_id) values
  (pg_temp.uid('e91'), 'מנהל', 'mta'),
  (pg_temp.uid('e92'), 'כותב', 'mta'),
  (pg_temp.uid('e93'), 'מדווח', 'mta'),
  (pg_temp.uid('e94'), 'עד', 'mta');
insert into public.app_admins (user_id) values (pg_temp.uid('e91'));

insert into public.api_teams (api_id, name) values (604, 'Maccabi Tel Aviv'), (4486, 'Hapoel Tel Aviv') on conflict do nothing;
insert into public.fixtures (id, league_id, season, round, kickoff_at, status, home_api_id, away_api_id)
  values (9901, 383, 2026, 'R1', now() + interval '10 minutes', 'NS', 604, 4486);

-- ---------- content and reports ----------
select pg_temp.as_fan('e92');
set local role authenticated;
insert into public.team_messages (body) values ('הודעה   מעליבה לבדיקה');
select set_config('t.msg', (select id::text from public.team_messages where user_id = auth.uid()), true);
insert into public.clips (media_path, kind, caption) values (pg_temp.uid('e92') || '/c.jpg', 'image', 'כיתוב לבדיקה');
select set_config('t.clip', (select id::text from public.clips where user_id = auth.uid()), true);
insert into public.market_items (category, title, condition, price) values ('shirt', 'חולצה ישנה', 'used', 50);
select set_config('t.item', (select id::text from public.market_items where user_id = auth.uid()), true);
reset role;

select pg_temp.as_fan('e94');
set local role authenticated;
insert into public.clips (media_path, kind) values (pg_temp.uid('e94') || '/x.jpg', 'image');
select set_config('t.clip94', (select id::text from public.clips where user_id = auth.uid()), true);
insert into public.reports (kind, ref, reason) values ('team_message', current_setting('t.msg'), 'הטרדה');
reset role;

select pg_temp.as_fan('e93');
set local role authenticated;
insert into public.device_keys (device_id, public_jwk) values ('deve93', '{"kty":"EC"}');
insert into public.dm_threads (user_a, user_b) values (pg_temp.uid('e92'), pg_temp.uid('e93'));
select set_config('t.th', (select id::text from public.dm_threads), true);
insert into public.dm_messages (thread_id, sender_device, iv, ciphertext, wrapped_keys)
  values (current_setting('t.th')::uuid, 'deve93', 'aXY=', 'U0VDUkVUX0NJUEhFUg==', '{"deve93":{"i":"x","w":"y"}}');
insert into public.reports (kind, ref, reason, note) values
  ('team_message', current_setting('t.msg'), 'הטרדה', ''),
  ('clip', current_setting('t.clip'), 'תוכן מיני', ''),
  ('dm_thread', current_setting('t.th'), 'הטרדה', 'שולח לי איומים'),
  ('user', pg_temp.uid('e92')::text, 'ספאם', ''),
  ('market_item', current_setting('t.item'), 'פריט מזויף / מכירת כרטיסים', ''),
  ('contact', '', 'פרטיות', 'בקשה לעיין במידע שנשמר עליי');

-- ---------- 1. a fan is not an admin ----------
select is(public.is_app_admin(), false, 'a fan is not an admin');
select throws_ok($$ select * from public.admin_report_queue() $$, '42501', 'not_admin', 'a fan cannot read the queue');
select throws_ok($$ select public.admin_open_count() $$, '42501', 'not_admin', 'a fan cannot count reports');
select throws_ok(format('select * from public.admin_remove_content(%L, %L)', 'team_message', current_setting('t.msg')),
  '42501', 'not_admin', 'a fan cannot remove content');
select throws_ok(format('select public.admin_ban_user(%L, 7, %L)', pg_temp.uid('e92'), 'x'), '42501', 'not_admin',
  'a fan cannot suspend');
select throws_ok(format('select public.admin_unban_user(%L)', pg_temp.uid('e92')), '42501', 'not_admin', 'a fan cannot lift a suspension');
select throws_ok(format('select public.admin_set_report_status(%L, %L)', gen_random_uuid(), 'dismissed'), '42501', 'not_admin',
  'a fan cannot dismiss reports');
select throws_ok($$ select * from public.admin_ban_list() $$, '42501', 'not_admin', 'a fan cannot list suspensions');
select throws_ok($$ select * from public.admin_recent_actions() $$, '42501', 'not_admin', 'a fan cannot read the audit trail');
select throws_ok($$ select count(*) from public.app_admins $$, '42501', null, 'the admins table is closed to fans');
select throws_ok($$ select count(*) from public.fan_bans $$, '42501', null, 'the suspensions table is closed to fans');
select throws_ok($$ select count(*) from public.admin_actions $$, '42501', null, 'the audit table is closed to fans');
select throws_ok($$ select count(*) from public.reports $$, '42501', null, 'fans still never read reports');
reset role;

-- ---------- 2. the admin's queue ----------
select pg_temp.as_fan('e91');
set local role authenticated;
select is(public.is_app_admin(), true, 'the admin is an admin');
select is(public.admin_open_count(), 7, 'every open report is counted');
select is((select q.target_preview from public.admin_report_queue() q where q.ref = current_setting('t.msg') limit 1),
  'הודעה מעליבה לבדיקה', 'a chat message shows its text (spaces folded)');
select is((select q.target_nick from public.admin_report_queue() q where q.ref = current_setting('t.msg') limit 1),
  'כותב', 'the writer is named');
select is((select q.open_reports_on_target from public.admin_report_queue() q where q.ref = current_setting('t.msg') limit 1),
  2, 'two fans reported the same message');
select is((select q.target_preview from public.admin_report_queue() q where q.kind = 'clip'), 'תמונה: כיתוב לבדיקה',
  'a post shows its kind and caption');
select is((select q.target_preview from public.admin_report_queue() q where q.kind = 'market_item'), 'חולצה ישנה',
  'a market item shows its title');
select is((select q.target_preview from public.admin_report_queue() q where q.kind = 'dm_thread'), 'כותב ↔ מדווח',
  'a private conversation shows the two nicknames only');
select is((select q.target_user_id from public.admin_report_queue() q where q.kind = 'dm_thread'), pg_temp.uid('e92'),
  'the target of a private conversation is the member who did not report it');
select ok(not exists (select 1 from public.admin_report_queue() q where q::text like '%U0VDUkVU%'),
  'no private message content anywhere in the queue');
select is((select q.reporter_nick || ' ' || q.reporter_contact from public.admin_report_queue() q where q.kind = 'contact'),
  'מדווח e93@test.local', 'a contact request shows who asked and how to answer');
select is((select q.target_exists from public.admin_report_queue() q where q.kind = 'contact'), false, 'a contact request has no target');
select is((select count(*)::int from public.admin_report_queue() q where q.reporter_contact is not null), 1,
  'contact details only on contact requests');
select set_config('t.last', (select q.created_at::text || '|' || q.id::text from public.admin_report_queue('open', 2) q
                               order by q.created_at, q.id limit 1), true);
select is((select count(*)::int from public.admin_report_queue('open', 100, split_part(current_setting('t.last'), '|', 1)::timestamptz,
                                                               split_part(current_setting('t.last'), '|', 2)::uuid)),
  5, 'the next page continues after the last row (keyset)');

-- ---------- 3. remove content ----------
select is((select r.removed from public.admin_remove_content('team_message', current_setting('t.msg')) r), true, 'the message is removed');
select is((select r.bucket || ':' || r.path from public.admin_remove_content('clip', current_setting('t.clip')) r),
  'clips:' || pg_temp.uid('e92') || '/c.jpg', 'removing a post returns its file for the server to delete');
select throws_ok($$ select * from public.admin_remove_content('user', 'x') $$, '22023', 'bad_kind', 'a fan is suspended, not removed');
select is((select q.target_exists from public.admin_report_queue('handled') q where q.ref = current_setting('t.msg') limit 1), false,
  'a handled report shows the content is gone');
reset role;
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 0, 'the message row is gone');
select is((select count(*)::int from public.reports where ref = current_setting('t.msg') and status = 'handled'), 2,
  'every report on the message is handled');
select is((select count(*)::int from public.admin_actions where admin_id = pg_temp.uid('e91') and action = 'remove'), 2,
  'each removal is in the audit trail');

-- ---------- 4. suspend ----------
select pg_temp.as_fan('e91');
set local role authenticated;
select ok(public.admin_ban_user(pg_temp.uid('e92'), 7, 'הטרדה') > now() + interval '6 days', 'a 7-day suspension');
select is(public.admin_open_count(), 1, 'the reports about the suspended fan are handled (only the contact request is left)');
select lives_ok((select format('select public.admin_set_report_status(%L, %L)', q.id, 'dismissed') from public.admin_report_queue() q where q.kind = 'contact'),
  'the admin dismisses a report');
select is((select count(*)::int from public.admin_report_queue('dismissed')), 1, 'it moves to the dismissed tab');
select is((select count(*)::int from public.admin_ban_list() b where b.user_id = pg_temp.uid('e92')), 1, 'the suspension is listed');
select throws_ok(format('select public.admin_ban_user(%L, 7, %L)', pg_temp.uid('e91'), 'x'), '42501', 'cannot_ban_admin',
  'an admin is never suspended');
reset role;

select pg_temp.as_fan('e92');
set local role authenticated;
select throws_ok($$ insert into public.team_messages (body) values ('שוב אני') $$, '42501', 'banned', 'suspended: no team chat');
select throws_ok($$ insert into public.match_messages (fixture_id, body) values (9901, 'שוב אני') $$, '42501', 'banned',
  'suspended: no match room');
select throws_ok(format('insert into public.clips (media_path, kind) values (%L, %L)', pg_temp.uid('e92') || '/d.jpg', 'image'),
  '42501', 'banned', 'suspended: no posts');
select throws_ok(format('insert into public.clip_comments (clip_id, body) values (%L, %L)', current_setting('t.clip94'), 'שוב'),
  '42501', 'banned', 'suspended: no comments');
select throws_ok($$ insert into public.market_items (category, title, condition, price) values ('scarf', 'צעיף', 'new', 20) $$,
  '42501', 'banned', 'suspended: no market items');
select lives_ok(format('insert into public.clip_likes (clip_id) values (%L)', current_setting('t.clip94')),
  'a like is not writing: the post''s counter still updates');
select is(public.my_ban_active(), true, 'the suspended fan''s account-delete check sees the suspension');
reset role;
select pg_temp.as_fan('e94');
set local role authenticated;
select is(public.my_ban_active(), false, 'a fan without a suspension may delete their account');
reset role;

-- The suspension ends on time.
update public.fan_bans set until = now() - interval '1 second' where user_id = pg_temp.uid('e92');
select pg_temp.as_fan('e92');
set local role authenticated;
select lives_ok($$ insert into public.team_messages (body) values ('חזרתי') $$, 'an expired suspension no longer blocks');
reset role;

-- For good, then lifted.
select pg_temp.as_fan('e91');
set local role authenticated;
select is(public.admin_ban_user(pg_temp.uid('e92'), null, 'ספאם'), null::timestamptz, 'a suspension for good has no end');
reset role;
select pg_temp.as_fan('e92');
set local role authenticated;
select throws_ok($$ insert into public.team_messages (body) values ('ועוד') $$, '42501', 'banned', 'for good blocks');
reset role;
select pg_temp.as_fan('e91');
set local role authenticated;
select lives_ok(format('select public.admin_unban_user(%L)', pg_temp.uid('e92')), 'the admin lifts the suspension');
reset role;
select pg_temp.as_fan('e92');
set local role authenticated;
select lives_ok($$ insert into public.team_messages (body) values ('תודה') $$, 'the fan writes again');
reset role;

-- ---------- 5. a report outlives its reporter ----------
delete from auth.users where id = pg_temp.uid('e93');
select is((select count(*)::int from public.reports where reporter_id is null and created_at = now()), 6,
  'the reporter''s account is gone, the reports stay without a name');
select is((select note::text from public.reports where kind = 'contact' and created_at = now()), 'הפנייה נמחקה עם החשבון',
  'a kept contact request loses its text with the account');
select is((select note::text from public.reports where kind = 'dm_thread' and created_at = now()), 'שולח לי איומים',
  'an ordinary report keeps its note');

-- ---------- 7. consent is recorded with the profile ----------
select pg_temp.as_fan('e95');
set local role authenticated;
select throws_ok(format('insert into public.profiles (user_id, nick, team_id) values (%L, %L, %L)', pg_temp.uid('e95'), 'בלי_הסכמה', 'mta'),
  '42501', null, 'a profile without the current terms version is refused');
select throws_ok(format('insert into public.profiles (user_id, nick, team_id, terms_version) values (%L, %L, %L, %L)', pg_temp.uid('e95'), 'ישן', 'mta', '2020-01-01'),
  '42501', null, 'an old terms version is refused');
select lives_ok(format('insert into public.profiles (user_id, nick, team_id, terms_version) values (%L, %L, %L, %L)', pg_temp.uid('e95'), 'מסכים', 'mta', '2026-10-15'),
  'a profile with the current terms version is created');
select is((select terms_version::text from public.profiles where user_id = auth.uid()), '2026-10-15', 'the accepted version is stored');
select throws_ok($$ update public.profiles set terms_version = 'legacy' where user_id = auth.uid() $$, '42501', null,
  'the fan cannot change the recorded version');
reset role;

-- ---------- 8. a song's recording is in its creator's own folder ----------
insert into public.club_reps (team_id, user_id) values ('mta', pg_temp.uid('e94'));
select pg_temp.as_fan('e94');
set local role authenticated;
select throws_ok(format('insert into public.chants (title, audio_path) values (%L, %L)', 'שיר זר', pg_temp.uid('e92') || '/song.mp3'),
  '42501', 'bad_path', 'a song cannot point at another fan''s file');
select lives_ok(format('insert into public.chants (title, audio_path) values (%L, %L)', 'שיר שלי', pg_temp.uid('e94') || '/song.mp3'),
  'a song with its creator''s own recording');

-- ---------- 6. logged-out visitors ----------
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname = 'is_app_admin')
                         and has_function_privilege('anon', p.oid, 'execute')),
  'logged-out visitors run no admin function');

select * from finish();
rollback;
