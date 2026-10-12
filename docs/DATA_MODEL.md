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
| `profiles` | `user_id uuid pk → auth.users`, `nick varchar(20)`, `team_id → teams`, `created_at` | insert own row once; `team_id` immutable (trigger `profiles_lock_team`); update `nick` only |
| `device_keys` | `(user_id, device_id) pk`, `public_jwk jsonb`, `created_at` | select: authenticated; insert/update/delete: own rows |

## Live tables (P2, 2026-10-11)
- `team_messages`: as below, plus `nick` stamped by trigger; only `body` is insertable; 5 messages / 10 s; Broadcast to private channel `team:<club>`.
- `match_messages`: `fixture_id`, `side` and `nick` stamped by trigger; writable only by fans of the two clubs (`club_of_api()`), only while `match_room_open()` (−30′ … +170′); channel `match:<fixture id>`.
- `clips` + `clip_views` / `clip_likes` / `clip_respects` / `clip_comments`: as in "The Square" below; `clip_seen()` (security definer) breaks the clips ↔ clip_views policy loop; uploads ≤ 10 per hour; bucket `clips` (private, 50 MB, images + mp4/mov/webm).
- Privileges: nothing is granted implicitly (migration `explicit_privileges`); each migration revokes and grants exactly.

## Team space (team-private: `team_id = my_team()`)
| Table | Columns | Indexes / triggers |
|---|---|---|
| `team_messages` | `id`, `team_id`, `user_id`, `body varchar(200)`, `created_at` | `(team_id, created_at desc)`; realtime publication |
| `team_photos` | `id`, `team_id`, `user_id`, `media_path`, `caption varchar(120)`, `likes_count`, `comments_count`, `created_at` | `(team_id, created_at desc)` |
| `team_photo_likes` | `(photo_id, user_id) pk` | trigger keeps `likes_count` |
| `team_photo_comments` | `id`, `photo_id`, `user_id`, `body varchar(120)`, `created_at` | trigger keeps `comments_count` |
| `player_ratings` | `(player_id, user_id) pk`, `stars smallint check 1..5`, `review varchar(200)`, `updated_at` | trigger maintains `player_rating_stats` |
| `player_rating_stats` | `player_id pk`, `sum int`, `count int`, `d1..d5 int` | written by trigger only |
| `trips`, `events`, `market_items` | P4 | |

## Match rooms
| Table | Columns | Rules |
|---|---|---|
| `match_messages` | `id`, `fixture_id`, `user_id`, `side 'h'/'a'`, `body varchar(200)`, `created_at` | read: authenticated; insert: only fans of one of the two teams, only while the room is open (30′ before kick-off → 60′ after full time); idx `(fixture_id, created_at)` |

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
| `dm_threads` | `id`, `user_a`, `user_b` (`user_a < user_b`, unique pair), `last_at`, `last_from` | members only; both must share a team |
| `dm_messages` | `id`, `thread_id`, `sender_id`, `sender_device`, `iv`, `ciphertext`, `wrapped_keys jsonb`, `created_at` | members only; insert as self; no update/delete; idx `(thread_id, created_at desc)` |
The server never stores plaintext. Crypto: per-device ECDH P-256 keys, HKDF-SHA-256, AES-256-GCM per message, key wrapped per device.

## Safety
| Table | Columns | Rules |
|---|---|---|
| `reports` | `id`, `reporter_id`, `kind`, `ref`, `reason`, `note`, `created_at`, `status` | insert own; no select for fans; moderators via service role / admin role |
| `blocks` | `(user_id, blocked_id) pk` | own rows; used in feed and chat filters |

## Storage buckets
| Bucket | Access | Path |
|---|---|---|
| `clips` | read: authenticated (signed URLs); write: own folder | `clips/{user_id}/{clip_id}.{ext}` |
| `team-photos` | read: same team (signed URLs); write: own folder | `team-photos/{team_id}/{user_id}/{id}.jpg` |
| `avatars` | public read; write own | `avatars/{user_id}.jpg` |
