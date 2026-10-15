-- Auto-hide (20261015200000_auto_hide): content reported by 25 different fans whose accounts were at least 3 days old
-- is hidden (never deleted) for everyone but its author and admins, until an admin restores or removes it.
begin;
select plan(43);

create function pg_temp.uid(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-000000000' || p)::uuid
$$;
-- Reporters: old accounts '00ad-…g', fresh accounts '00ae-…g'.
create function pg_temp.old_fan(g int) returns uuid language sql as $$
  select ('00000000-0000-0000-00ad-' || lpad(g::text, 12, '0'))::uuid
$$;
create function pg_temp.new_fan(g int) returns uuid language sql as $$
  select ('00000000-0000-0000-00ae-' || lpad(g::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

insert into auth.users (id, aud, role, email) values
  (pg_temp.uid('c01'), 'authenticated', 'authenticated', 'c01@test.local'),
  (pg_temp.uid('c02'), 'authenticated', 'authenticated', 'c02@test.local'),
  (pg_temp.uid('c03'), 'authenticated', 'authenticated', 'c03@test.local');
insert into auth.users (id, aud, role, email)
  select pg_temp.old_fan(g), 'authenticated', 'authenticated', 'old' || g || '@test.local' from generate_series(1, 30) g;
insert into auth.users (id, aud, role, email)
  select pg_temp.new_fan(g), 'authenticated', 'authenticated', 'new' || g || '@test.local' from generate_series(1, 10) g;
-- Inserted as postgres, so created_at is kept as given (a fan's own insert is stamped now()).
insert into public.profiles (user_id, nick, team_id, created_at) values
  (pg_temp.uid('c01'), 'מנהל', 'mta', now() - interval '30 days'),
  (pg_temp.uid('c02'), 'כותב', 'mta', now() - interval '30 days'),
  (pg_temp.uid('c03'), 'צופה', 'mta', now() - interval '30 days');
insert into public.profiles (user_id, nick, team_id, created_at)
  select pg_temp.old_fan(g), 'ותיק' || g, 'mta', now() - interval '4 days' from generate_series(1, 30) g;
insert into public.profiles (user_id, nick, team_id, created_at)
  select pg_temp.new_fan(g), 'חדש' || g, 'mta', now() - interval '2 days' from generate_series(1, 10) g;
insert into public.app_admins (user_id) values (pg_temp.uid('c01'));

-- ---------- content ----------
select pg_temp.as_user(pg_temp.uid('c02'));
set local role authenticated;
insert into public.team_messages (body) values ('הודעה שתוסתר');
select set_config('t.msg', (select id::text from public.team_messages where user_id = auth.uid()), true);
insert into public.clips (media_path, kind, caption) values (pg_temp.uid('c02') || '/h.jpg', 'image', 'פוסט שיוסתר');
select set_config('t.clip', (select id::text from public.clips where user_id = auth.uid()), true);
insert into public.market_items (category, title, condition, price) values ('shirt', 'חולצה', 'used', 50);
select set_config('t.item', (select id::text from public.market_items where user_id = auth.uid()), true);
insert into public.player_ratings (player_id, stars, review) values ('mta_1', 2, 'ביקורת שתוסתר');
reset role;
select set_config('t.review', 'mta_1:' || pg_temp.uid('c02'), true);

select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
insert into public.team_messages (body, reply_to) values ('תשובה', current_setting('t.msg')::uuid);
select set_config('t.reply', (select id::text from public.team_messages where user_id = auth.uid()), true);
insert into public.clip_comments (clip_id, body) values (current_setting('t.clip')::uuid, 'תגובה של הצופה');
reset role;
select is((select reply_body::text from public.team_messages where id = current_setting('t.reply')::uuid), 'הודעה שתוסתר',
  'a reply quotes the message while it is visible');

-- ---------- 1. the rules ----------
select is((select min_reporters from private.auto_hide_rules()), 25, 'the threshold is 25 fans');
select is((select min_account_age from private.auto_hide_rules()), interval '3 days', 'accounts must be 3 days old');

-- ---------- 2. 24 old accounts, 10 fresh ones and a repeat: still visible ----------
insert into public.reports (reporter_id, kind, ref, reason)
  select pg_temp.new_fan(g), 'team_message', current_setting('t.msg'), 'הטרדה' from generate_series(1, 10) g;
insert into public.reports (reporter_id, kind, ref, reason)
  select pg_temp.old_fan(g), 'team_message', current_setting('t.msg'), 'הטרדה' from generate_series(1, 24) g;
insert into public.reports (reporter_id, kind, ref, reason)
  values (pg_temp.old_fan(1), 'team_message', current_setting('t.msg'), 'ספאם');
select is((select hidden_at from public.team_messages where id = current_setting('t.msg')::uuid), null,
  '24 different old accounts + 10 fresh ones + one repeat: not hidden');

select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 1, 'other fans still see it');
reset role;

-- ---------- 3. the 25th different old account (a fan's own report, through RLS): hidden ----------
select pg_temp.as_user(pg_temp.old_fan(25));
set local role authenticated;
insert into public.reports (kind, ref, reason) values ('team_message', current_setting('t.msg'), 'הטרדה');
reset role;
select isnt((select hidden_at from public.team_messages where id = current_setting('t.msg')::uuid), null, 'the 25th fan hides it');
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 1, 'hidden, never deleted');
select is((select count(*)::int from public.admin_actions
            where action = 'auto_hide' and ref = current_setting('t.msg') and admin_id is null and target_user = pg_temp.uid('c02')), 1,
  'the auto-hide is in the audit trail, with the writer');
select is((select reply_body from public.team_messages where id = current_setting('t.reply')::uuid), null,
  'quotes of the hidden message are cleared');
select is((select reply_nick::text from public.team_messages where id = current_setting('t.reply')::uuid), 'כותב',
  'the reply still says whom it answered');

select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 0, 'other fans no longer see it');
select is((select count(*)::int from public.team_messages where id = current_setting('t.reply')::uuid), 1, 'the replies stay');
reset role;

select pg_temp.as_user(pg_temp.uid('c02'));
set local role authenticated;
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 1, 'its author still sees it');
insert into public.team_messages (body, reply_to) values ('אני עונה לעצמי', current_setting('t.msg')::uuid);
select is((select reply_body from public.team_messages where body = 'אני עונה לעצמי'), null,
  'a new reply to a hidden message quotes no text');
select throws_ok(format('update public.team_messages set hidden_at = null where id = %L', current_setting('t.msg')), '42501', null,
  'the author cannot clear hidden_at');
select throws_ok(format('update public.market_items set hidden_at = now() where id = %L', current_setting('t.item')), '42501', null,
  'a fan cannot set hidden_at, even on a table with an update grant');
select throws_ok($$ insert into public.team_messages (body, hidden_at) values ('מוסתרת מראש', null) $$, '42501', null,
  'a fan cannot send hidden_at');
reset role;

select ok(not exists (
  select 1 from unnest(array['team_messages', 'match_messages', 'clips', 'clip_comments', 'team_photos', 'team_photo_comments',
                             'player_ratings', 'market_items', 'trips', 'fan_events', 'chants']) t
   where has_column_privilege('authenticated', 'public.' || t, 'hidden_at', 'UPDATE')
      or has_column_privilege('authenticated', 'public.' || t, 'hidden_at', 'INSERT')
      or has_column_privilege('anon', 'public.' || t, 'hidden_at', 'SELECT')),
  'no fan may write hidden_at anywhere, and logged-out visitors read none of these tables');

select pg_temp.as_user(pg_temp.uid('c01'));
set local role authenticated;
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 1, 'the admin sees it');
select is((select bool_and(q.target_hidden) from public.admin_report_queue('open', 100) q where q.ref = current_setting('t.msg')), true,
  'the queue says it is hidden');
select is((select bool_or(q.target_hidden) from public.admin_report_queue('open', 100) q where q.ref <> current_setting('t.msg')), null,
  'nothing else is reported yet');
reset role;

-- A 26th report changes nothing more.
insert into public.reports (reporter_id, kind, ref, reason) values (pg_temp.old_fan(26), 'team_message', current_setting('t.msg'), 'הטרדה');
select is((select count(*)::int from public.admin_actions where action = 'auto_hide' and ref = current_setting('t.msg')), 1,
  'one audit row per hiding');

-- ---------- 4. a post, all 25 reports at once: the post, its comments and its likes are gone for others ----------
insert into public.reports (reporter_id, kind, ref, reason)
  select pg_temp.old_fan(g), 'clip', current_setting('t.clip'), 'תוכן מיני' from generate_series(1, 25) g;
select isnt((select hidden_at from public.clips where id = current_setting('t.clip')::uuid), null, '25 reports in one go hide a post');
select is((select count(*)::int from public.admin_actions where action = 'auto_hide' and ref = current_setting('t.clip')), 1,
  'and write one audit row');

select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
select is((select count(*)::int from public.clips where id = current_setting('t.clip')::uuid), 0, 'the post is gone from the Square');
select is((select count(*)::int from public.clip_comments where clip_id = current_setting('t.clip')::uuid), 0,
  'its comments too, even for their own writer');
select throws_ok(format('insert into public.clip_likes (clip_id) values (%L)', current_setting('t.clip')), '42501', null,
  'a hidden post cannot be liked');
reset role;

select pg_temp.as_user(pg_temp.uid('c02'));
set local role authenticated;
select is((select count(*)::int from public.clips where id = current_setting('t.clip')::uuid), 1, 'the poster still sees the post');
reset role;

-- ---------- 5. a review (ref '<player>:<author>') ----------
insert into public.reports (reporter_id, kind, ref, reason)
  select pg_temp.old_fan(g), 'review', current_setting('t.review'), 'הטרדה' from generate_series(1, 25) g;
select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
select is((select count(*)::int from public.player_ratings where user_id = pg_temp.uid('c02')), 0, 'a hidden review is gone');
select is((select count(*)::int from public.home_player_reviews(20) r where r.author_id = pg_temp.uid('c02')), 0,
  'and is not on the home');
reset role;
select pg_temp.as_user(pg_temp.uid('c02'));
set local role authenticated;
select is((select count(*)::int from public.home_player_reviews(20) r where r.author_id = pg_temp.uid('c02')), 1,
  'its author still sees it on the home');
reset role;

-- ---------- 6. restore ----------
select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
select throws_ok(format('select public.admin_restore_content(%L, %L)', 'team_message', current_setting('t.msg')), '42501', 'not_admin',
  'a fan cannot restore');
reset role;

select pg_temp.as_user(pg_temp.uid('c01'));
set local role authenticated;
select is(public.admin_restore_content('team_message', current_setting('t.msg')), true, 'the admin restores the message');
select throws_ok($$ select public.admin_restore_content('user', 'x') $$, '22023', 'bad_kind', 'only content can be restored');
select is((select r.removed from public.admin_remove_content('clip', current_setting('t.clip')) r), true,
  'a hidden post can still be removed');
reset role;

select is((select hidden_at from public.team_messages where id = current_setting('t.msg')::uuid), null, 'hidden_at is cleared');
select is((select count(*)::int from public.reports where ref = current_setting('t.msg') and status = 'open'), 0, 'no open report is left');
select is((select count(*)::int from public.reports where ref = current_setting('t.msg') and status = 'dismissed'), 37,
  'every report on it is dismissed');
select is((select count(*)::int from public.admin_actions
            where action = 'restore' and ref = current_setting('t.msg') and admin_id = pg_temp.uid('c01')), 1,
  'the restore is in the audit trail');
select is((select count(*)::int from public.clips where id = current_setting('t.clip')::uuid), 0, 'the removed post is deleted');

select pg_temp.as_user(pg_temp.uid('c03'));
set local role authenticated;
select is((select count(*)::int from public.team_messages where id = current_setting('t.msg')::uuid), 1, 'other fans see it again');
reset role;

-- After a restore the count starts again from zero.
insert into public.reports (reporter_id, kind, ref, reason) values (pg_temp.old_fan(27), 'team_message', current_setting('t.msg'), 'הטרדה');
select is((select hidden_at from public.team_messages where id = current_setting('t.msg')::uuid), null,
  'a new report after a restore does not hide it again');

-- ---------- 7. logged-out visitors ----------
select ok(not has_function_privilege('anon', 'public.admin_restore_content(text, text)', 'execute'), 'logged-out visitors cannot restore');

select * from finish();
rollback;
