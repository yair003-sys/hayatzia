# Data model (Postgres on Supabase)

Target schema for the new app. Source of truth once P1 starts: `apps/web/src/db/schema/*.ts` (Drizzle) + `apps/web/supabase/migrations/*.sql`. Keep this file in sync.

Conventions: `snake_case`, `uuid` ids (`gen_random_uuid()`) unless noted, `timestamptz` times, RLS **enabled on every table** and deny by default.

## Helper functions
- `my_team() returns text`: `select team_id from profiles where user_id = auth.uid()`; `security definer`, `stable`.
- `same_team(uid uuid) returns boolean`: true if that user's team equals `my_team()`.

## Reference data (read by everyone, written by ingest only)
| Table | Key columns | Notes |
|---|---|---|
| `teams` | `id text pk` (mta, mhf…), `name`, `short`, `color_bg`, `color_ring`, `api_id int unique` | seeded; 14 clubs |
| `players` | `id text pk`, `team_id → teams`, `number`, `name_he`, `name_short`, `position`, `injured bool` | seeded from current squads, later API |
| `fixtures` | `id bigint pk` (API id), `season`, `round`, `kickoff_at`, `status`, `elapsed`, `home_team_id`, `away_team_id`, `home_goals`, `away_goals`, `venue` | idx `(kickoff_at)`, `(home_team_id, kickoff_at)`, `(away_team_id, kickoff_at)` |
| `standings` | `(season, group_name, team_id) pk`, `rank`, `points`, `played`, `won`, `drawn`, `lost`, `gf`, `ga`, `form` | |
| `lineups` | `(fixture_id, team_id) pk`, `formation`, `coach`, `start_xi jsonb`, `subs jsonb` | |
| `match_events` | `id`, `fixture_id`, `minute`, `extra`, `team_id`, `type`, `detail`, `player`, `assist` | idx `(fixture_id, minute)` |
RLS: `select` for `authenticated` and `anon`; no write policies (only the secret key used by ingest writes).

## People
| Table | Columns | Rules |
|---|---|---|
| `profiles` | `user_id uuid pk → auth.users`, `nick varchar(20)`, `team_id → teams`, `created_at` | insert own row once; `team_id` immutable (trigger `profiles_lock_team`); update `nick` only |
| `device_keys` | `(user_id, device_id) pk`, `public_jwk jsonb`, `created_at` | select: authenticated; insert/update/delete: own rows |

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
