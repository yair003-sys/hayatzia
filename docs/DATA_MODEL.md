# Data model (Postgres on Supabase)

Target schema for the new app. Source of truth: `apps/web/supabase/migrations/*.sql` (TS types are generated from them into `apps/web/src/lib/supabase/database.types.ts`; security tested in `apps/web/supabase/tests/database/*.test.sql`). Keep this file in sync.

Conventions: `snake_case`, `uuid` ids (`gen_random_uuid()`) unless noted, `timestamptz` times, RLS **enabled on every table** and deny by default.

## Helper functions
- `my_team() returns text`: `select team_id from profiles where user_id = auth.uid()`; `security definer`, `stable`.
- `same_team(uid uuid) returns boolean`: true if that user's team equals `my_team()`.

## Reference data (read by everyone, written by ingest only)
Live since 2026-10-11 (migration `20261011200000_league_data.sql`), filled by `apps/web/scripts/ingest-league.ts` from the legacy `data/*.json` after every change.
| Table | Key columns | Notes |
|---|---|---|
| `teams` | `id text pk` (mta, mhf…), `name`, `short`, `color_bg`, `color_ring`, `api_id int unique` | seeded; 14 clubs |
| `players` | `id text pk`, `team_id → teams`, `number`, `name_he`, `name_short`, `position`, `injured bool` | seeded from current squads, later API |
| `api_teams` | `api_id int pk`, `name`, `logo` | every club API-Football mentions (past seasons include clubs outside today's 14) |
| `fixtures` | `id bigint pk` (API id), `league_id`, `season`, `round`, `kickoff_at`, `status`, `elapsed`, `home_api_id`/`away_api_id → api_teams`, `home_goals`, `away_goals`, `venue` | idx `(season, kickoff_at)`, `(home_api_id, kickoff_at)`, `(away_api_id, kickoff_at)` |
| `standings` | `(season, group_name, api_team_id) pk`, `group_order`, `rank`, `points`, `played`, `won`, `drawn`, `lost`, `gf`, `ga`, `gd`, `form`, `description` | idx `(season, group_order, rank)`; rows not refreshed in a run are deleted |
| `fixture_details` | `fixture_id pk → fixtures`, `events jsonb`, `lineups jsonb` | one PK read per match page; normalise only when a feature queries inside |
RLS: `select` for `anon` + `authenticated`; writes only through the secret key (`service_role`).

## People
| Table | Columns | Rules |
|---|---|---|
| `profiles` | `user_id uuid pk → auth.users`, `nick varchar(20)`, `team_id → teams`, `created_at`, `terms_version varchar(20)` (default `'legacy'` for rows from before 2026-10-15), `gender text` (`m`/`f`/`x`, null = not answered; self-declared, rides only), `adult_confirmed_at`, `ride_safety_seen_at` (ride safety, 2026-10-15) | insert own row once, and only with the current terms version (restrictive policy `profiles_insert_terms`; the value is `TERMS_VERSION` in `lib/legal.ts`, a new version needs a migration replacing the policy); `team_id` immutable (trigger `profiles_lock_team`); update `nick`, `gender`, `adult_confirmed_at`, `ride_safety_seen_at` only; **select is column-level** (`user_id`, `nick`, `team_id`, `created_at`, `terms_version`): the three ride columns are read only through `my_ride_profile()` / `ride_drivers()`; the two times are stamped `now()` by trigger `profiles_ride_stamp` and never cleared |
| `device_keys` | `(user_id, device_id) pk`, `public_jwk jsonb`, `created_at` | select: authenticated; insert/update/delete: own rows |

## Live tables (P2, 2026-10-11)
- `team_messages`: as below, plus `nick` stamped by trigger; only `body` is insertable; 5 messages / 10 s; Broadcast to private channel `team:<club>`.
- `match_messages`: `fixture_id`, `side` and `nick` stamped by trigger; writable only by fans of the two clubs (`club_of_api()`), only while `match_room_open()` (−30′ … +170′); channel `match:<fixture id>`.
- `clips` + `clip_views` / `clip_likes` / `clip_respects` / `clip_comments`: as in "The Square" below; `clip_seen()` (security definer) breaks the clips ↔ clip_views policy loop; uploads ≤ 10 per hour; bucket `clips` (private, 50 MB, images + mp4/mov/webm).
- Privileges: nothing is granted implicitly (migration `explicit_privileges`); each migration revokes and grants exactly.
- Replies (2026-10-15, migration `chat_replies`): `team_messages` and `match_messages` add `reply_to uuid`, `reply_user uuid`, `reply_nick varchar(20)`, `reply_body varchar(80)`. The fan sends `reply_to` only (insert grant); the BEFORE INSERT trigger `zr_reply` (`chat_reply_stamp`) refuses a message of another club / fixture (`bad_reply`, 23503) and stamps the snapshot: the quoted author (`reply_user`, so the app hides quotes of blocked fans), nick, and up to 80 characters of the body cut at the last space and moderated again (a cut can create a listed word; blocked text → no text); the snapshot is never granted and is cleared without `reply_to`. `dm_messages` and `dm_group_messages` add `reply_to uuid` only, checked by `zr_reply` (`dm_reply_check`): same thread / same group and sent since the replier joined. No foreign key and no index on `reply_to` (lookups by primary key only; deleting messages never scans for replies). Realtime rows carry the new columns.

## Team space (team-private: `team_id = my_team()`)
| Table | Columns | Indexes / triggers |
|---|---|---|
| `team_messages` | `id`, `team_id`, `user_id`, `body varchar(200)`, `created_at` | `(team_id, created_at desc)`; realtime publication |
| `team_photos` | `id`, `team_id`, `user_id`, `media_path`, `caption varchar(120)`, `likes_count`, `comments_count`, `created_at` | `(team_id, created_at desc)` |
| `team_photo_likes` | `(photo_id, user_id) pk` | trigger keeps `likes_count` |
| `team_photo_comments` | `id`, `photo_id`, `user_id`, `body varchar(120)`, `created_at` | trigger keeps `comments_count` |
| `player_ratings` | `(player_id, user_id) pk`, `stars smallint check 1..5`, `review varchar(200)`, `updated_at`, `likes_count` (trigger only) | trigger maintains `player_rating_stats`; stamped only on writes of stars/words (a like never moves `updated_at`); idx `(player_id, likes_count desc, updated_at desc) where review <> ''` |
| `player_rating_stats` | `player_id pk`, `sum int`, `count int`, `d1..d5 int` | written by trigger only |
| `player_rating_likes` | `(player_id, author_id, user_id) pk`, `created_at`; FK `(player_id, author_id)` → `player_ratings` on delete cascade | ♥ on a review (2026-10-14). select own; insert own only for a review with words of a player of the fan's club, not your own, no block either way (`blocked_between`); delete own. Trigger keeps `player_ratings.likes_count` exact (+1/−1). New words on a review set `likes_count` to 0 in the fan's own update and delete its likes without per-like updates of the review (new stars keep them). idx `(user_id, created_at desc)`, `(player_id, created_at desc)` |
| `trips`, `events`, `market_items` | P4 | |

## Match rooms
| Table | Columns | Rules |
|---|---|---|
| `match_messages` | `id`, `fixture_id`, `user_id`, `side 'h'/'a'`, `body varchar(200)`, `created_at` | read: authenticated; insert: only fans of one of the two teams, only while the room is open (30′ before kick-off → 60′ after full time); idx `(fixture_id, created_at)` |

## Stand home (2026-10-12)
| Table | Columns | Rules |
|---|---|---|
| `team_stats` | `team_id pk`, `fans` | read: fans of that club; kept by trigger on `profiles` insert/delete ("אוהדים מאומתים") |
Realtime Presence (private topics, RLS on `realtime.messages` with `extension = 'presence'`): `online:<club>` (own club only; tracked once per app by `OnlineTracker` in the session gate → "מחוברים עכשיו"), `room:<fixture>` (any fan; tracked by the match room, read by the home ticket → "X אוהדים בחדר"). Counts are distinct user ids. The tracked metadata is `{user_id, typing?}`: the club chat (on `online:<club>`) and the match room (on `room:<fixture>`) set `typing: true` while the fan types (at most one track per 2 s; off after 4 s idle, on send, blur, hidden page or leaving) → "N אוהדים כותבים…". Client-supplied, so shown as a count only, never names; no DB writes.

## Predictions (2026-10-12)
| Table | Columns | Rules |
|---|---|---|
| `predictions` | `(user_id, fixture_id) pk`, `team_id` (stamped), `home_goals`, `away_goals` (0–20), `points` (0/1/3), `exact` | own rows; insert/update only before kick-off (`locked`); points written only by `score_fixture` |
| `prediction_totals` | `(team_id, season, user_id) pk`, `points`, `exact`, `played` | read: own club; kept by trigger from point changes (re-scoring never double counts) |
`score_fixture(id)` runs from a trigger on `fixtures` when status or score changes. `clips.audience` (`all`/`team`): team posts are visible only to the poster's club.

## Crowd verdict (דעת הקהל, in the match room, 2026-10-12)
| Table | Columns | Rules |
|---|---|---|
| `match_polls` | `id`, `fixture_id`, `kind` (penalty/red/offside/var/card/goal/sub60/sub_event/motm), `question`, `options jsonb`, `options_in jsonb` (bench row, sub60), `source` (chat/event/schedule), `voter_scope` (club or null), `opens_at`, `closes_at` (+90 s), `summary` (set once on close), `last_tally_at` | read: authenticated; created only by the database (chat bursts) or service role (`open_event_poll`); idx `(fixture_id, opens_at desc)` |
| `match_poll_votes` | `(poll_id, user_id) pk`, `option_id`, `option_in`, `voter_group` (h/a/n, stamped), `updated_at` | own rows only; insert/update while open, valid option, within scope |
| `match_poll_tallies` | `(poll_id, row_kind o/i, option_id, voter_group) pk`, `n` | read: authenticated; written only by the vote trigger |
| `match_chat_bursts` | `(fixture_id, kind, user_id) pk`, `at` | internal: distinct fans per keyword, rolling 60 s |
| `match_poll_queue` | `id`, `fixture_id`, `kind`, `source`, `payload`, `queued_at` | internal: event polls waiting for the open poll (dropped after 3 min) |
Functions: `crowd_keyword(text)`, `crowd_open_poll(...)` (internal), `crowd_tick(fixture)` (authenticated + service role; idempotent close + next from queue), `open_event_poll(...)` (service role only). Broadcasts on `match:<fixture_id>`: `poll`, `tally` (≤ 1/s per poll), `poll_closed`. `fixtures.is_demo` flags staging demo matches.

## The Square (league-wide, 24 hours)
| Table | Columns | Rules |
|---|---|---|
| `clips` | `id`, `user_id`, `team_id`, `media_path`, `kind 'image'/'video'`, `caption varchar(120)`, `tags varchar(60)`, `once bool`, `likes_count`, `respects_count`, `comments_count`, `views_count`, `created_at`, `expires_at default now()+24h` | read: authenticated and `expires_at > now()` and (not `once` or owner or not yet viewed); insert own; delete own; idx `(expires_at desc)`, `(team_id, created_at desc)` |
| `clip_likes` | `(clip_id, user_id) pk` | trigger → `likes_count` |
| `clip_respects` | `(clip_id, user_id) pk` | only if `my_team() <> clip.team_id`; trigger → `respects_count` |
| `clip_views` | `(clip_id, user_id) pk`, `viewed_at` | view-once record; trigger → `views_count` |
| `clip_comments` | `id`, `clip_id`, `user_id`, `team_id`, `body varchar(150)`, `created_at` | trigger → `comments_count` |
Cron (`pg_cron`, hourly): delete expired clips and their Storage objects.

## Private messages (end-to-end encrypted)
| Table | Columns | Rules |
|---|---|---|
| `dm_threads` | `id`, `user_a`, `user_b` (`user_a < user_b`, unique pair), `last_at`, `last_from`, `last_message_id`, `unread_a`, `unread_b` | members only; both must share a team; after-insert trigger on `dm_messages` sets the preview pointer and the other side's unread counter |
| `dm_messages` | `id`, `thread_id`, `sender_id`, `sender_device`, `iv`, `ciphertext`, `wrapped_keys jsonb`, `created_at` | members only; insert as self; no update/delete; idx `(thread_id, created_at desc)` |
| `dm_groups` | `id`, `team_id`, `name varchar(40)` (2–40), `created_by`, `created_at`, `last_at`, `last_from`, `last_message_id`, `members_count` | read: members and live invitees; no direct writes (RPCs only); `members_count` (admins + members) by trigger |
| `dm_group_members` | `(group_id, user_id) pk`, `role` (`admin`/`member`/`invited`), `invited_by`, `invited_at`, `joined_at` (null while invited), `unread`, `muted` | read: members see the group's rows, an invitee only their own; invites older than 7 days hidden; RPCs only. Trigger: admin hand-over to the earliest-joined member, empty group deleted. idx `(user_id, group_id)` |
| `dm_group_messages` | `id`, `group_id`, `sender_id`, `sender_device`, `iv`, `ciphertext` (< 4000), `wrapped_keys jsonb` (≤ 60 keys, `pg_column_size` < 16000), `created_at` | insert by a current member as self (stamped, 10 per 10 s); read: members, only messages since they joined, hidden when a block exists either way with the sender (`blocked_between`). idx `(group_id, created_at desc, id desc)`, `(sender_id, created_at desc)` |
| `dm_group_events` | `id`, `group_id`, `kind` (`join`/`leave`/`remove`/`rename`), `actor`, `subject`, `created_at` | system lines, ids only; read: members, since they joined |

The server never stores plaintext. Crypto: per-device ECDH P-256 keys, HKDF-SHA-256, AES-256-GCM per message, key wrapped per device (a group message: each current member's newest 3 devices; a device whose public key is unusable is skipped).

Groups (same club, at most 20 fans including live invites, invite-only, invites expire after 7 days). Security-definer RPCs, the only way to change groups:
`create_group(name, members[]) → id` (caller is admin, the others invited) · `invite_to_group(group, members[]) → uuid[]` (admin; returns the fans actually invited, skipping ones already in the group; no block with anyone in the group) · `answer_invite(group, yes)` · `remove_from_group(group, user)` (admin; also cancels an invite) · `leave_group(group)` · `rename_group(group, name)` (admin) · `mute_group(group, muted)` · `mark_read('dm'|'group', id)` (zeroes the caller's counter) · `group_push_targets(group) → setof uuid` (non-muted fellow members with no block either way; who gets a push about a new message).
Counters: `dm_group_members.unread` grows for every other member without a block either way with the sender (after-insert trigger), which also pings each such member's `inbox:<user>` channel. Realtime private channels: `dm:<thread>`, `grp:<group>` (members), `inbox:<user>` (self). Notifications carry no message content: group name + sender nickname; invites: inviter nickname + group name.

## Safety
| Table | Columns | Rules |
|---|---|---|
| `reports` | `id`, `reporter_id` (nullable, `on delete set null`: a report outlives its reporter), `kind`, `ref`, `reason`, `note varchar(500)` (≤ 120 except `contact`), `created_at`, `status` (`open`/`handled`/`dismissed`) | insert own (30 a day); no select for fans; admins through the RPCs below; idx `(status, created_at desc)`, `(kind, ref, reporter_id) where status = 'open'` (auto-hide count, reports per target) |
| `blocks` | `(user_id, blocked_id) pk` | own rows; used in feed and chat filters; `blocked_between(a, b)` (security definer) checks both directions for private messages and groups |

Report reasons are a list in code (`features/safety/schema.ts`, `reason varchar(60)`), including "פריט מזויף / מכירת כרטיסים" (2026-10-15). Kinds and their `ref`: `team_message`, `match_message`, `clip`, `clip_comment`, `photo`, `photo_comment`, `market_item`, `trip`, `event`, `chant` (the row id), `review` (`<player id>:<author id>`), `user` (user id), `dm_thread` (thread id), `contact` ("צור קשר" in "הכרטיס שלי": `ref ''`, topic פרטיות/נגישות/אחר in `reason`, the text in `note`; after sending, the form keeps "קיבלנו את הפנייה. נחזור אליך תוך 48 שעות לכתובת המייל של החשבון." on screen, no e-mail is sent by the app). Report buttons: Square posts, private conversations, fans in a group, market items, and (2026-10-15) every other fan's message in the team chat and match rooms ("דווח" next to "השב") and Square comments. Stand photo comments have no screen yet.

### Moderation (2026-10-15, migration `moderation_admin`)
| Table | Columns | Rules |
|---|---|---|
| `app_admins` | `user_id pk → auth.users` (cascade), `created_at` | no fan access at all; read through `is_app_admin()`. Added by hand per project (below) |
| `fan_bans` | `user_id pk → auth.users` (cascade), `until` (null = for good), `reason varchar(120)`, `by_admin` (set null), `created_at` | no fan access; written by `admin_ban_user` / `admin_unban_user` |
| `admin_actions` | `id bigint identity`, `admin_id` (set null), `action` (`remove`/`ban`/`unban`/`status`/`auto_hide`/`restore`; `auto_hide` has no admin), `kind`, `ref`, `target_user` (no FK: the record stays), `note`, `created_at` | audit trail, one row per admin action; read through `admin_recent_actions()`; idx `(created_at desc, id desc)` |

Functions (authenticated only; every `admin_*` one raises `not_admin` 42501 for anyone not in `app_admins`; security definer, `search_path ''`):
`is_app_admin() → boolean` · `admin_report_queue(p_status = 'open', p_limit = 50, p_before, p_before_id)` (keyset, newest first: report fields, `reporter_nick`, `reporter_contact` (e-mail / phone, `contact` requests only), `target_user_id`, `target_nick`, `target_preview` (≤ 200 chars of the reported text; for `dm_thread` only the two nicknames, never anything from the encrypted messages), `target_exists`, `open_reports_on_target`, `target_hidden`) · `admin_open_count()` · `admin_remove_content(p_kind, p_ref) → (removed, bucket, path)` (deletes the row, handles every open report on it; the server action deletes the returned Storage file with the service key) · `admin_restore_content(p_kind, p_ref) → boolean` (clears `hidden_at`, dismisses every open report on it; true when it was hidden; `bad_kind` for non-content kinds) · `admin_ban_user(p_user, p_days null = for good, p_reason) → until` (never an admin: `cannot_ban_admin`; handles every open report whose target is that fan) · `admin_unban_user(p_user)` · `admin_set_report_status(p_report, p_status)` · `admin_ban_list()` · `admin_recent_actions()`.

Auto-hide (2026-10-15, migration `auto_hide`): content reported by at least 25 **different** fans is hidden until an admin decides. Only open reports from accounts that were at least 3 days old when they reported count (`profiles.created_at`, stamped by the database); a fan's repeat reports count once. Hideable kinds: `team_message`, `match_message`, `clip`, `clip_comment`, `photo`, `photo_comment`, `review`, `market_item`, `trip`, `event`, `chant` (not `user`, `dm_thread`, `contact`). Each of their tables (`team_messages`, `match_messages`, `clips`, `clip_comments`, `team_photos`, `team_photo_comments`, `player_ratings`, `market_items`, `trips`, `fan_events`, `chants`) has `hidden_at timestamptz` (null = visible), never granted to fans for insert or update. A restrictive select policy `<table>_not_hidden` on each lets only the author (`user_id`; `created_by` for chants) and admins (`is_app_admin()`) read a hidden row, so feeds, comments, likes, Storage files and `home_player_reviews` (all through RLS) drop it for everyone else. The after-insert trigger `reports_auto_hide` on `reports` (`private.reports_auto_hide`, security definer) counts distinct qualifying reporters over `(kind, ref, reporter_id) where status = 'open'` (stops at the threshold; one count at a time per target, advisory lock), and at 25 sets `hidden_at = now()` (`private.set_content_hidden`) and writes an `admin_actions` row (`auto_hide`, `admin_id` null). The rules live in `private.auto_hide_rules()` (25, 3 days): change them with `create or replace`. Hiding a chat message also clears `reply_body` on replies quoting it, and a new reply to a hidden message quotes the nick only (`chat_reply_stamp`); a restore does not bring old quotes back. Realtime: chat broadcasts are insert-only, so a hidden row is never re-broadcast; open screens keep showing it until they reload. The admin's queue shows "הוסתר אוטומטית" and "החזר תוכן" (`admin_restore_content`); `admin_remove_content` works on hidden rows as before. After a restore the count starts again from zero (its reports are dismissed).

Suspension: `private.moderate_row` (the `zz_moderate` trigger on every public content table) raises `banned` (42501) when the acting fan has an active `fan_bans` row, on every insert and on an update that changes a filtered text column (counters, "sold" flags and account-deletion `set null` steps still work). Private messages are end-to-end encrypted and have no such trigger. A suspended fan cannot delete the account (`my_ban_active()`, asked by the delete action: "אי אפשר למחוק חשבון בזמן השעיה"); signing up again with the same phone number is blocked only once phone sign-in (SMS) exists, by keeping a hash of the suspended number. When a reporter's account is deleted, their `contact` requests keep only "הפנייה נמחקה עם החשבון" (trigger `reports_forget_contact`). `chants.audio_path` must sit in the creator's own folder (trigger `chants_own_file`, `bad_path`), like the other media tables. The app shows "החשבון מושעה מכתיבה" (`lib/moderation.ts`). Screen: `/admin/reports` (admins only, `notFound()` for others), linked with an open-reports badge from "הכרטיס שלי".

Adding an admin (once per project, in the SQL editor; never in a migration):
```sql
insert into public.app_admins (user_id) select id from auth.users where email = '<owner email>';
```

### Ride safety (2026-10-15, migration `ride_safety`)
Spec `superpowers/specs/2026-10-15-ride-safety-design.md`; owner's procedure `docs/RIDE_SAFETY.md`.

| Table | Columns | Rules |
|---|---|---|
| `trips` (added) | `pickup varchar(80)` (public pickup point; required ≥ 3 in the app, moderated as a name), `women_only boolean` | BEFORE INSERT `trips_ride_rules`: `not_adult`, `ride_suspended`, `phone_required` (when on), `women_only` (only a driver with `gender = 'f'`). Restrictive select `trips_not_ride_suspended` (a ride-suspended fan's trips are hidden from everyone but the fan and admins); restrictive delete `trips_keep_during_case`. idx `(fixture_id) where kind = 'offer'` |
| `trip_requests` (rules) | — | BEFORE INSERT / UPDATE OF status `trip_requests_ride_rules`: the same gate for the rider, `women_only` (requester `gender = 'f'`), no accepting while rider or driver is ride-suspended. Restrictive select `trip_requests_not_ride_suspended`, restrictive delete `trip_requests_keep_during_case` |
| `ride_ratings` | `(trip_id, rater_id) pk`, `driver_id`, `stars 1–5`, `created_at`; `trip_id` has no FK (a rating outlives the trip) | insert `(trip_id, stars)` only; trigger `ride_ratings_check`: an accepted rider of a ride **offer**, after the match (`FT`/`AET`/`PEN` or kickoff + 2 h), once (`not_a_ride`, `not_a_rider`, `ride_not_over`); select own; idx `(driver_id)`, `(rater_id, created_at desc)` |
| `ride_driver_stats` | `driver_id pk`, `rides_completed`, `ratings_count`, `ratings_sum` | read: fans of the driver's club; ratings by trigger on `ride_ratings`; `rides_completed` by trigger on `fixtures` when the status turns final: +1 per ride offer of that match with ≥ 1 accepted rider at that moment (−1 if the feed takes the final status back) |
| `ride_suspensions` | `user_id pk` (cascade), `reason varchar(120)`, `by_report → reports` (set null), `created_at`, `lifted_at` (null = active), `lifted_by` (no FK) | no fan access; idx `(created_at desc) where lifted_at is null`, `(by_report)` |
| `private.app_settings` | `key pk`, `value jsonb`, `updated_at` | no fan access; `private.setting_on(key)`. `rides_require_phone` = `false` (turn on when SMS exists: needs `auth.users.phone_confirmed_at`) |

Harm report: an after-insert trigger `reports_ride_harm` on `reports` with `reason = 'הטרדה או פגיעה בנסיעה'` (`private.ride_harm_reason()`, also `RIDE_HARM_REASON` in `features/safety/schema.ts`) and kind `trip` (the trip's author) or `user` (`ref`) suspends that fan from rides at once (`ride_suspensions`, audit `admin_actions` `ride_suspend` with no admin) — only when the reporter confirmed 18+ and is in the same club, never an admin or the reporter. The report action then pushes "דיווח דחוף על נסיעה" to every admin (`admin_user_ids()`, service role only). The app offers that reason only on rides and fans, never as the default.

Functions: `my_ride_profile() → (gender, adult_confirmed, safety_seen, ride_suspended, phone_required, phone_ok)` · `ride_drivers(uuid[]) → (user_id, member_since, rides_completed, ratings_count, ratings_sum, female)` (≤ 200 ids; fans of the caller's club who posted a ride) · `my_ride_case_open() → boolean` (active ride suspension, or an open harm report on the fan or one of their trips; the delete-account action refuses: "אי אפשר למחוק חשבון בזמן בירור") · `admin_ride_suspensions(p_limit)` · `admin_lift_ride_suspension(p_user) → boolean` (audit `ride_unsuspend`) · `admin_user_ids()` (service role only). Private: `private.ride_suspended(uuid)`, `private.ride_case_open(uuid)` (used by policies), `private.ride_gate(uuid)`. `admin_actions.action` adds `ride_suspend`, `ride_unsuspend`.

### Account deletion (2026-10-15)
"מחיקת החשבון" (`features/account/server/actions.ts`) deletes `auth.users` with the service role, user id from the session only. Every public foreign key to `auth.users` is `on delete cascade`, except "who did it" columns that are `set null`: `dm_groups.created_by`, `dm_group_members.invited_by`, `dm_group_events.actor`/`subject`, `activity.actor_id`, `reports.reporter_id` (the report stays for the moderators), `fan_bans.by_admin`, `admin_actions.admin_id` (pgTAP `account_delete.test.sql` fails on any other kind). Denormalised ids without a foreign key (`dm_threads.last_from`, `dm_groups.last_from`) keep a stale id; harmless (threads with the fan are deleted, a group shows only the last preview). Trigger-kept totals (team fans, rating stats, lineups tally, crowd war of matches not yet started) count down on delete; anonymous totals of finished crowd wars stay. Storage files are not rows: before the delete the action removes `<user id>/…` in `clips`, `stand`, `market` and `chants`. Device private keys stay in that browser's IndexedDB (useless without the account).

## Activity bell (התראות, 2026-10-14)
| Table | Columns | Rules |
|---|---|---|
| `activity` | `id bigserial`, `user_id` (recipient), `kind` (`clip_like`/`photo_like`/`trip_request`/`trip_accepted`), `clip_id`/`photo_id`/`trip_id` (one set, cascade), `requester_id` (requests only, cascade), `actor_id` (latest actor, set null on account delete), `actor_count` (likes: exact count of likes other than the owner's own and blocked fans', from `likes_count`), `created_at`, `updated_at`, generated `subject` | select own only; written only by triggers on `clip_likes`, `team_photo_likes` (`*_notify`, after `*_count`), `trip_requests`; unique `(user_id, kind, subject, requester_id) nulls not distinct`; keyset index `(user_id, updated_at desc, id desc)`; own actions and fans blocked either way skipped; **60-day retention is pruned on write** (no scheduled job): each new row for a fan first deletes that fan's rows older than 60 days, and the badge ignores older rows; every change pings `inbox:<user>` (event `activity`, payload `{kind}` only) |
| `activity_seen` | `user_id pk`, `seen_at` | select own; written only by `mark_activity_seen(p_upto)` |

RPCs (authenticated only): `activity_unread_count() → int` (rows with `updated_at > seen_at` within 60 days, capped at 100 = "99+"; requests from fans the viewer blocked are left out, as in the list) · `mark_activity_seen(p_upto)` (seen up to the newest row the list showed, clamped to the clock, never backwards).

## Fan lineup (ההרכב של האוהדים, 2026-10-14)
| Table | Columns | Rules |
|---|---|---|
| `fan_lineups` | `(fixture_id, user_id) pk`, `team_id` (stamped: the fan's club), `formation` (`4-3-3`/`4-4-2`/`3-5-2`/`4-2-3-1`/`5-3-2`), `slots jsonb` (`[{slot 0..10, player_id}]` × 11, stored in slot order), `updated_at` | select own only; no direct client writes (RPCs only). Stamp trigger on every insert/update: profile required, the match involves the fan's club (`club_of_api`), `clock_timestamp() < kickoff_at` (the real clock, not the transaction start) and status `NS`/`TBD` (else `locked`; also for the service role), 11 distinct players of the fan's club (coach excluded), slots 0..10 once each. idx `(user_id, fixture_id)` |
| `fan_lineup_tallies` | `(fixture_id, team_id, formation, slot, player_id) pk`, `picks > 0` | read: authenticated (counts only); trigger-only; old XI −1 / new XI +1 netted per slot, rows at 0 removed; no FK to players |
| `fan_lineup_totals` | `(fixture_id, team_id) pk`, `fans`, `formations jsonb` (`{"4-3-3": 12, …}`) | read: authenticated; trigger-only; the row is locked on every change so a club's counts move one save at a time |

RPCs (authenticated only): `save_fan_lineup(p_fixture, p_formation, p_slots) → fan_lineups` (upsert; errors `no profile`/`not_your_match`/`not_your_player` 42501, `locked` P0001, `bad_formation`/`bad_slots`/`bad_players` 22023) · `clear_fan_lineup(p_fixture) → boolean` (before kick-off only). Demo fixtures (`is_demo`) are treated like any other match (as predictions do).

## Home (היציע, 2026-10-14)
| Table | Columns | Rules |
|---|---|---|
| `clip_like_days` | `(team_id, day, user_id) pk`, `likes` | internal (no fan access): likes received per fan per day (the post's day, Israel time) from other fans, kept by trigger on `clip_likes`; survives the 24-hour Square cleanup (a post being deleted does not decrement); rows older than 14 days pruned on write. **No backfill**: likes given before 2026-10-14 are not in it |

Functions (authenticated; the club ones also the service role, for a server-side cache keyed by club):
`home_player_reviews(p_per_player = 5)` (invoker) → per player of the caller's club, the 1..20 most-liked reviews with words of the last 30 days (`player_id, author_id, nick, review, stars, likes_count, liked, updated_at`), authors with a block either way hidden, ordered by player then likes · `home_active_fans(p_team) → int` (definer) distinct club fans with a chat message, Square post, prediction saved, player rated, review liked, check-in or fan lineup in the last 7 days · `home_fans_of_week(p_team) → (nick, points)` (definer) top 3, points = prediction points of matches kicked off in the last 7 days + 1 per player rated in the last 7 days + likes received on Square posts of the last 7 days (`clip_like_days`); ties by nick. Both refuse any club but the caller's own, and a null club (`not_your_club`, 42501), and return no fan ids. `home_fans_of_week` does **not** apply blocks (it is the same list for the whole club, cached per club); the UI may hide a blocked fan's row but should not refill it.
Story seen-state reuses `clip_views` (one row per clip and fan, own rows readable): "seen" = a `clip_views` row of mine. Note that viewing a view-once post hides it for that fan. "Online now" is Presence on `online:<club>` (see Stand home). New indexes: `team_messages (team_id, created_at) include (user_id)` (covering, active fans), `predictions (team_id, updated_at)`, `checkins (team_id, created_at)`, `fan_lineups (team_id, updated_at)`, `clips (likes_count desc, created_at desc)` (hot in the Square).

## Crowd war (מלחמת הקהלים, 2026-10-15)
| Table | Columns | Rules |
|---|---|---|
| `crowd_war_fans` | `(fixture_id, user_id) pk`, `team_id`, `chat` (0..20), `posts` (0..3), `predicted`, `lineup`, `points` (generated: chat + 5·posts + 5 + 5) | read: own row only; trigger-only (on `team_messages`, `match_messages`, `clips`, `predictions`, `fan_lineups`): counts only from 48 h before kick-off until kick-off, only for a fan of one of the two clubs, only for a match in status NS/TBD. Team chat and Square posts go to the club's earliest match in the window. A capped counter is not written again |
| `crowd_war_totals` | `(fixture_id, team_id) pk`, `points`, `fans`; index `(team_id, fixture_id)` | read: authenticated (aggregates, no fan ids); trigger-only on `crowd_war_fans` (sum of the fans). A fan row removed (account deleted) counts down only before kick-off: at kick-off the result is final |

Function: `crowd_war_record(p_team, p_season) → (wins, losses, draws)` (invoker, authenticated + service role): the club's finished wars of the season; a war where only one crowd scored is its win, equal points above zero a draw, no points at all not counted, demo matches (`is_demo`) left out. Removing a message, post, guess or lineup keeps the points.

## Storage buckets
| Bucket | Access | Path |
|---|---|---|
| `clips` | read: authenticated (signed URLs); write: own folder | `clips/{user_id}/{clip_id}.{ext}` |
| `team-photos` | read: same team (signed URLs); write: own folder | `team-photos/{team_id}/{user_id}/{id}.jpg` |
| `avatars` | public read; write own | `avatars/{user_id}.jpg` |
