# Team News Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every club an admin-authored news channel (rich posts with media), connected to the existing group chat, where fans react with emoji, discuss each post in its own thread, and get a push on every post.

**Architecture:** A new thin feature `features/team-news/` reuses the existing chat/square/push primitives. DB mirrors the `team_chat` + `message_reactions` (emoji) + `clip_views` patterns: `channel_posts` (admin-written), `channel_post_reactions` (= the shipped emoji model), `channel_post_comments` (per-post thread), `channel_post_views` (unique view counter), `team_channel_admins` (who may post), `channel_reads` (per-fan unread marker). The channel lives as a second tab beside the group chat; the latest post is pinned atop the chat tab with a "comments (N)" button that opens the post's own thread. Realtime broadcasts ride a new `news:<club>` topic (posts + reactions) and a per-post `newspost:<postId>` topic (comments). Push on each post is a fire-and-forget fanout from the create-post action via the existing `sendPush`.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions via `next-safe-action`), Supabase Postgres + RLS + triggers + Realtime broadcast, Storage (public `channel` bucket + CDN), `web-push`, Tailwind v4, next-intl, pgTAP, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-news-channel-design.md` (the spec's reactions section §66–73 is already shipped — migration `20261101090000_emoji_reactions.sql` — and is reused, not rebuilt).

## Global Constraints

- Hebrew-only, RTL UI; all user-facing strings go through next-intl namespaces in **all five** `apps/web/messages/{he,en,de,es,fr}.json`.
- Supabase migrations applied **staging first, verified, then production**; never hand-edit `database.types.ts` (CI's `web-db.yml` regenerates it on `main`).
- RLS is deny-by-default: every new table does `revoke all ... from anon, authenticated` then column-scoped `grant`s; server-stamped columns (team_id, user_id, nick, created_at, counters) get no client insert/update grant and are set by a `before` trigger.
- Policies call `(select public.my_team())` and `(select auth.uid())`; admin gate is `public.is_app_admin()` or membership in `team_channel_admins`.
- Private message plaintext never goes to the server (not touched here, but do not route channel comments through the DM E2E path — channel comments are club-public, like chat).
- Scale: every query is keyset-paginated on `(created_at, id)` DESC (never OFFSET), `PAGE_SIZE = 50`; counters kept by trigger (never counted on read); media via Storage + CDN; indexes for every query path.
- Demo/sample content must be labelled as such (not expected here; no seed posts in migrations).
- Moderation: any fan-authored free text (comments) passes the existing `zz_moderate` trigger.

## Engineering decisions (stated out loud; builder follows these)

- **ED1 — Cross-post = pinned banner, not a chat row.** When a post is created we do **not** insert a system row into `team_messages`. The chat tab fetches the latest channel post separately and renders it pinned on top with a "תגובות (N)" button. This keeps the live chat table and its stamp/moderation triggers untouched and keeps post-comments out of the message stream (spec anti-goal). The news tab holds the full feed.
- **ED2 — In-app notice = push + unread dot, not N activity rows.** We do not fan a row per club-fan into `activity` on each post (unbounded write). Instead one `channel_reads` row per fan tracks `last_seen_at`; the News tab shows an unread dot when a newer post exists. The "notification" the spec asks for is delivered by push (below) + this dot.
- **ED3 — Push fanout = fire-and-forget from the create-post action.** After the post row is inserted, the action resolves club fans with push subscriptions via a keyset RPC and calls the existing `sendPush` (never throws, pages internally). Immediate, matches the DM/trip push pattern. A queue+cron (like `match_alerts`) is the later scale path if a club outgrows the action's time budget — noted, not built now.
- **ED4 — Media bucket is public + CDN.** Channel media is club-broadcast content, so a **public** `channel` bucket with `getPublicUrl` (CDN-cached) is used (not private signed URLs). Upload is admin-only, enforced by a storage policy.
- **ED5 — Reactions reuse the shipped emoji model exactly.** `channel_post_reactions` mirrors `message_reactions` (stamp + recompute-aggregate count trigger writing `channel_posts.reactions jsonb`, broadcasting `REACTION` on `news:<club>`). The UI reuses the `Emoji` component and the `POPULAR_REACTIONS`/`MORE_REACTIONS`/`QUICK_LIKE` sets from `features/chat/schema.ts`.
- **ED6 — Tabs keep panels mounted.** The News|Chat tabs use the `MatchTabs` pattern (all panels rendered, inactive ones `hidden`) so the chat's realtime subscription survives tab switches.

## Review Focus

- **Non-admin posting attempt** (anti-goal): a fan with no `team_channel_admins` row calling the insert path must be refused by RLS (`42501`), not just hidden in the UI. — pinned in Task 1 tests.
- **Cross-club admin** (anti-goal): an admin of club A inserting a post/comment/reaction with club B's `team_id`, or posting to B's channel, must fail. — pinned in Task 1/3 tests.
- **Oversized / wrong-type media upload**: an upload exceeding 50MB or a disallowed MIME must be refused by the bucket (`file_size_limit`/`allowed_mime_types`) and the orphan object rolled back when the row insert fails. — pinned in Task 7 + Task 10 tests.
- **Double view / double reaction**: the same fan opening a post twice, or reacting twice, must not double-count (PK/unique + insert-only view trigger). — pinned in Task 2/4 tests.
- **Empty/garbage realtime payload**: a malformed `news:<club>` broadcast must not crash the feed (parser returns null → ignored), mirroring `reactionFromBroadcast`. — pinned in Task 12 tests.

---

## File structure (created/modified)

DB (all under `apps/web/supabase/`):
- `migrations/20261102090000_team_channel.sql` — admins table, posts, RLS, stamp+moderation triggers, indexes.
- `migrations/20261102090100_channel_reactions.sql` — post reactions (emoji model) + jsonb + triggers + broadcast.
- `migrations/20261102090200_channel_comments.sql` — comments + counter + stamp + moderation + broadcast.
- `migrations/20261102090300_channel_views.sql` — unique views + counter.
- `migrations/20261102090400_channel_reads_and_push.sql` — `channel_reads` + unread RPC + push-recipients RPC.
- `migrations/20261102090500_channel_bucket.sql` — public `channel` Storage bucket + object policies.
- `tests/database/channel_posts.test.sql`, `channel_reactions.test.sql`, `channel_comments.test.sql`, `channel_views.test.sql`, `channel_push.test.sql` — pgTAP.

App (under `apps/web/src/`):
- `features/team-news/schema.ts` — types, Zod schemas, broadcast parsers, reaction re-exports.
- `features/team-news/server/queries.ts` — `getTeamNews`, `getLatestPost`, `getPostComments`, `getChannelUnread`, `amIChannelAdmin`.
- `features/team-news/server/actions.ts` — create/edit/delete post, react, comment, mark-viewed, mark-seen, load-older, push fanout.
- `features/team-news/components/news-feed.tsx`, `post-card.tsx`, `post-composer.tsx`, `post-comments.tsx`, `pinned-post.tsx`, `post-reactions.tsx`.
- `app/(app)/stand/chat/page.tsx` — MODIFY: wrap Chat + News in tabs; add pinned post to chat panel.
- `features/chat/components/chat-room.tsx` — MODIFY (small): extract the reaction control into `post-reactions.tsx` for reuse, or export the reaction constants (see Task 12).
- `messages/{he,en,de,es,fr}.json` — MODIFY: new `teamNews` namespace + `nav` label.

---

## Task 1: DB — channel admins + posts (RLS, stamp, moderation)

**Files:**
- Create: `apps/web/supabase/migrations/20261102090000_team_channel.sql`
- Test: `apps/web/supabase/tests/database/channel_posts.test.sql`

**Interfaces:**
- Produces: tables `public.team_channel_admins (team_id text, user_id uuid, created_at)` PK `(team_id, user_id)`; `public.channel_posts (id uuid default gen_random_uuid() pk, team_id text not null, author_id uuid not null, title text, body text not null, media_path text, media_kind text check in ('image','video'), views_count int not null default 0, reactions jsonb not null default '{}', comments_count int not null default 0, created_at timestamptz, edited_at timestamptz)`. Helper `public.can_post_channel(p_team text) returns boolean` = `is_app_admin() or exists(team_channel_admins where team_id=p_team and user_id=auth.uid())`.
- Consumes: `public.my_team()`, `public.is_app_admin()`, `private.moderate_row()` (existing).

- [ ] **Step 1: Write the failing pgTAP test** `channel_posts.test.sql` — `plan(9)`. Seed two clubs (`mta`, `hap`), three users: `admin_mta` (row in `team_channel_admins` for `mta`), `fan_mta`, `fan_hap`. Assertions:
  - `has_table('public','channel_posts', ...)`, `has_table('public','team_channel_admins', ...)`.
  - As `fan_mta`: `throws_ok($$ insert into channel_posts(team_id,title,body) values('mta','t','hi') $$, '42501', ...)` (non-admin can't post — Review Focus).
  - As `admin_mta`: `lives_ok($$ insert into channel_posts(body) values('hi') $$, ...)` and `is((select team_id from channel_posts ...), 'mta', ...)` and `is((select author_id ...), '<admin_mta uuid>', ...)` (club/author stamped, not client-supplied).
  - As `admin_mta`: `throws_ok($$ insert into channel_posts(team_id,body) values('hap','x') $$, '42501', ...)` (cross-club admin — Review Focus) — the stamp forces `my_team()`/membership so a `hap` insert from an `mta` admin fails `can_post_channel`.
  - As `fan_hap`: `is((select count(*) from channel_posts), 0::bigint, ...)` (RLS read scoped to own club — `fan_hap` sees none of `mta`'s posts).
  - As `fan_mta`: `is((select count(*) from channel_posts), 1::bigint, ...)` (same-club fan reads).
  - Offensive body: `throws_ok($$ insert ... body '<blocked term>' $$, '23514', ...)` (moderation trigger).
- [ ] **Step 2: Run it, verify it fails** — `web-db.yml` dispatch on branch, or local supabase. Expected: FAIL (tables absent).
- [ ] **Step 3: Write the migration.** Create both tables. `channel_posts` RLS: `select` using `team_id = (select public.my_team())`; `insert`/`update`/`delete` using/with-check `public.can_post_channel(team_id)`. A `before insert` stamp trigger `channel_posts_stamp` sets `team_id := (select public.my_team())`, `author_id := (select auth.uid())`, `created_at := now()`, and raises `42501` if `not public.can_post_channel(new.team_id)` (so a cross-club team_id is rejected even though the stamp overwrites it — set then check). `before update` stamp sets `edited_at := now()` and preserves team_id/author_id. Attach `zz_moderate before insert or update ... private.moderate_row('title:name','body:text')`. `team_channel_admins`: RLS enabled, no policies, read only via `can_post_channel`/server; `grant` nothing to anon/authenticated (owner inserts rows by hand in SQL editor). Grants on `channel_posts`: `grant select on channel_posts to authenticated`; `grant insert (title, body, media_path, media_kind) on channel_posts to authenticated`; `grant update (title, body) on channel_posts to authenticated`; `grant delete on channel_posts to authenticated`. Indexes: `channel_posts_feed_idx on (team_id, created_at desc, id desc)`. Define `can_post_channel` as `stable security definer set search_path=''`, `grant execute to authenticated`.
- [ ] **Step 4: Run tests, verify pass** — dispatch `web-db.yml`; expected PASS (plan 9).
- [ ] **Step 5: Commit** — `git add` the migration + test; `git commit -m "feat(channel): posts + per-club admins (RLS, stamp, moderation)"`.

## Task 2: DB — post reactions (emoji model, reused)

**Files:**
- Create: `apps/web/supabase/migrations/20261102090100_channel_reactions.sql`
- Test: `apps/web/supabase/tests/database/channel_reactions.test.sql`

**Interfaces:**
- Produces: `public.channel_post_reactions (post_id uuid, user_id uuid, team_id text, emoji text not null check char_length 1..32, created_at)` PK `(post_id, user_id)`; writes `channel_posts.reactions jsonb`; broadcasts `REACTION` on `news:<team_id>` with `{post_id, reactions}`.
- Consumes: Task 1 tables; `public.my_team()`; `realtime.send`.

- [ ] **Step 1: Write failing test** `channel_reactions.test.sql` — `plan(7)`, mirroring `message_reactions.test.sql` (use the `pg_temp.as_fan` + `grant select on <temp> to authenticated` gotcha). Seed a post. Assertions: same-club fan can insert one reaction (`lives_ok`); `channel_posts.reactions` becomes `{"❤️":1}` (`is`); re-inserting a different emoji via update changes it; delete removes it and `reactions` drops the key; cross-club fan `throws_ok` `42501` on insert; one-per-fan enforced by PK (`throws_ok` `23505` on a second insert same post+fan).
- [ ] **Step 2: Run it, verify fail.**
- [ ] **Step 3: Write migration** — copy the `message_reactions` emoji shape exactly (stamp trigger `channel_post_reactions_stamp` stamping team_id from the parent post + user_id + created_at, raising `42501` on wrong club; count trigger `channel_post_reactions_count` recompute-aggregating `jsonb_object_agg(emoji,count)` into `channel_posts.reactions` and `realtime.send(jsonb_build_object('post_id',pid,'reactions',v), 'REACTION', 'news:'||tid, true)`). RLS: read same-club; insert/update/delete own row (`user_id = (select auth.uid())`). Grants: `select, delete`; `insert (post_id, emoji)`; `update (emoji)`.
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): emoji reactions on posts (mirrors message_reactions)"`.

## Task 3: DB — post comments (per-post thread, counter, moderation)

**Files:**
- Create: `apps/web/supabase/migrations/20261102090200_channel_comments.sql`
- Test: `apps/web/supabase/tests/database/channel_comments.test.sql`

**Interfaces:**
- Produces: `public.channel_post_comments (id uuid pk default gen_random_uuid(), post_id uuid, user_id uuid, team_id text, nick varchar(20), body text not null, created_at)`; keeps `channel_posts.comments_count` by trigger; broadcasts `COMMENT` on `newspost:<post_id>` with the inserted row.
- Consumes: Task 1; `public.my_team()`; profile nick; `private.moderate_row`.

- [ ] **Step 1: Write failing test** `channel_comments.test.sql` — `plan(8)`. Seed a post. Same-club fan adds a comment (`lives_ok`); `channel_posts.comments_count` = 1 (`is`); nick/team stamped from profile (`is`); cross-club fan `throws_ok` `42501`; offensive body `throws_ok` `23514`; delete own comment decrements the count to 0 (`is`); rate-limit raises on the 6th within 10s (mirror `clip_comments` 5/10s) — assert `throws_ok`.
- [ ] **Step 2: Run it, verify fail.**
- [ ] **Step 3: Write migration** — table + `before insert` stamp `channel_post_comments_stamp` (stamp team_id from post + user_id + nick from `profiles` + created_at; `btrim` body; 5/10s rate-limit like `clip_comments_stamp`; raise `42501` cross-club); counter trigger reusing the delta pattern (`after insert or delete` → `channel_posts.comments_count = greatest(+/-1,0)`); broadcast on insert; `zz_moderate ... ('body:text')`. RLS read same-club; insert own (`with check user_id = auth.uid()`); delete own **or** `can_post_channel(team_id)` (an admin can remove a comment on their club's post). Grants: `select, delete`; `insert (post_id, body)`. Index `channel_post_comments_thread_idx on (post_id, created_at desc, id desc)`.
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): per-post comment threads (counter, moderation, rate-limit)"`.

## Task 4: DB — unique post views counter

**Files:**
- Create: `apps/web/supabase/migrations/20261102090300_channel_views.sql`
- Test: `apps/web/supabase/tests/database/channel_views.test.sql`

**Interfaces:**
- Produces: `public.channel_post_views (post_id uuid, user_id uuid, viewed_at)` PK `(post_id, user_id)`; increments `channel_posts.views_count` once per fan.
- Consumes: Task 1.

- [ ] **Step 1: Write failing test** `channel_views.test.sql` — `plan(4)`. Same-club fan inserts a view → `views_count` = 1 (`is`); the **same** fan inserting again `throws_ok` `23505` (PK) and `views_count` stays 1 (`is`) (double-view — Review Focus); a second fan's view → `views_count` = 2 (`is`).
- [ ] **Step 2: Run it, verify fail.**
- [ ] **Step 3: Write migration** — table (mirror `clip_views`), `before insert` stamp (team_id from post + user_id, raise `42501` cross-club), `after insert` counter trigger `+1` (insert-only, like `clip_views` branch). RLS read same-club; insert own. Grants: `select`; `insert (post_id)`.
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): unique per-fan view counter"`.

## Task 5: DB — unread marker + push-recipients RPC

**Files:**
- Create: `apps/web/supabase/migrations/20261102090400_channel_reads_and_push.sql`
- Test: `apps/web/supabase/tests/database/channel_push.test.sql`

**Interfaces:**
- Produces: `public.channel_reads (user_id uuid pk default auth.uid(), team_id text, last_seen_at timestamptz not null default 'epoch')`; RPC `public.channel_unread() returns boolean` (a post newer than the caller's `last_seen_at` exists for their club); RPC `public.channel_mark_seen() returns void` (upsert `last_seen_at = now()`); RPC `public.channel_post_recipients(p_club text, p_after uuid, p_limit int) returns setof uuid` (service_role only — club fans with a push subscription, keyset by user_id; mirror `alert_recipients`).
- Consumes: `public.profiles`, `public.push_subscriptions`, `public.channel_posts`.

- [ ] **Step 1: Write failing test** `channel_push.test.sql` — `plan(5)`. Seed club `mta`, two fans (one with a `push_subscriptions` row), one post. As `fan_mta` with `last_seen_at = epoch`: `channel_unread()` is `true` (`is`); after `channel_mark_seen()`, `channel_unread()` is `false` (`is`). As superuser calling `channel_post_recipients('mta', null, 100)`: returns exactly the one fan with a subscription (`results_eq`). Cross-club fan `channel_unread()` for an empty club is `false`. `channel_post_recipients` is not executable by `authenticated` (`ok(not has_function_privilege('authenticated','public.channel_post_recipients(text,uuid,int)','execute'), ...)`).
- [ ] **Step 2: Run it, verify fail.**
- [ ] **Step 3: Write migration** — `channel_reads` (own-row RLS, grant `select`; writes only via the two definer RPCs). `channel_unread`/`channel_mark_seen` `security definer`, grant execute to `authenticated`. `channel_post_recipients` `security definer`, grant execute to `service_role` only (mirror `alert_recipients`: join profiles on `team_id = p_club`, `exists(push_subscriptions)`, keyset `user_id > p_after order by user_id limit p_limit`).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): unread marker + push-recipients RPC"`.

## Task 6: DB — public `channel` media bucket

**Files:**
- Create: `apps/web/supabase/migrations/20261102090500_channel_bucket.sql`
- Test: (covered by Task 1's media columns + Task 10 action test; add a 2-assertion pgTAP `ok` on bucket existence/public flag inside `channel_posts.test.sql` extension, or a short `channel_bucket.test.sql` with `plan(2)`).

**Interfaces:**
- Produces: Storage bucket `channel` (`public = true`, `file_size_limit = 52428800`, same `allowed_mime_types` as `clips`). Upload policy: `insert` to `authenticated` with check `bucket_id='channel' and (storage.foldername(name))[1] = auth.uid()::text and public.can_post_channel((select public.my_team()))` (admin-only upload to own folder). Public read (bucket public → `getPublicUrl`). Delete-own policy.

- [ ] **Step 1: Write failing test** `channel_bucket.test.sql` — `plan(2)`: `is((select public from storage.buckets where id='channel'), true, ...)`; `is((select file_size_limit ...), 52428800, ...)` (oversized/type guard — Review Focus relies on this + the MIME list).
- [ ] **Step 2: Run it, verify fail.**
- [ ] **Step 3: Write migration** — insert bucket (on-conflict update, like clips); object policies as above.
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): public media bucket for post images/video"`. Then: apply migrations 1–6 to **staging**, verify, then **production** (per the standing rule; the shipped emoji migration is the template — disable no triggers here since these are new empty tables). Record each in `supabase_migrations.schema_migrations`.

## Task 7: Feature schema + types

**Files:**
- Create: `apps/web/src/features/team-news/schema.ts`
- Test: `apps/web/src/features/team-news/schema.test.ts`

**Interfaces:**
- Produces: `type NewsPost = { id, authorId, authorNick, title: string|null, body, mediaUrl: string|null, mediaKind: 'image'|'video'|null, views, reactions: Record<string,number>, myReaction: string|null, comments, createdAt, editedAt: string|null }`; `type NewsComment = { id, userId, nick, body, createdAt }`; Zod `createPostSchema = { title?: ≤80, body: 1..1000, mediaPath?: <clips-style path regex>, mediaKind?: 'image'|'video' }`, `editPostSchema`, `commentSchema = { postId: uuid, body: 1..500 }`, `reactPostSchema = { postId: uuid, emoji: string|null }`, `postCursorSchema` (= `{createdAt, id}`), `postIdSchema`. `postFromBroadcast(payload)`, `commentFromBroadcast(payload)`, `reactionFromBroadcast(payload)` (null on garbage — Review Focus). Re-export `POPULAR_REACTIONS, MORE_REACTIONS, QUICK_LIKE, totalReactions` from `@/features/chat/schema`.
- Consumes: `features/chat/schema.ts`.

- [ ] **Step 1: Write failing tests** — `postFromBroadcast` returns a `NewsPost` for a well-formed `{record}` and `null` for `{}`/missing id; `createPostSchema` rejects empty body, >1000 body, >80 title, a bad media path; `reactPostSchema` accepts `{postId, emoji:null}`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the types, schemas and parsers (parsers mirror `messageFromBroadcast`/`reactionFromBroadcast`).
- [ ] **Step 4: Run, verify pass** — `vitest run features/team-news/schema.test.ts`.
- [ ] **Step 5: Commit** — `"feat(channel): feature schema, zod inputs, broadcast parsers"`.

## Task 8: Server queries

**Files:**
- Create: `apps/web/src/features/team-news/server/queries.ts`
- Test: `apps/web/src/features/team-news/server/queries.test.ts` (unit with a mocked supabase client, mirroring existing query tests if any; otherwise assert the query builder is called with the keyset `.or(...)` and columns — keep light).

**Interfaces:**
- Produces: `getTeamNews(before?: Cursor): Promise<NewsPost[] | null>` (keyset `(created_at,id)` DESC, `limit PAGE_SIZE`, `.reverse()`, attach `mediaUrl` via `getPublicUrl`, attach `myReaction` from a second scoped query over `channel_post_reactions` for the page's ids); `getLatestPost(): Promise<NewsPost | null>` (newest for `my_team()`); `getPostComments(postId, before?): Promise<NewsComment[] | null>`; `getChannelUnread(): Promise<boolean>` (rpc `channel_unread`); `amIChannelAdmin(): Promise<boolean>` (rpc `can_post_channel(my_team())` or a dedicated `channel_can_post` rpc — add a thin `public.channel_can_post()` definer rpc in Task 5 if simpler than passing the club).
- Consumes: `@/lib/supabase/server` `createClient`; Tasks 1–5.

- [ ] **Step 1: Write failing test** — `getTeamNews(undefined)` builds a select on `channel_posts` ordered desc with `limit 50`; with a cursor it adds the `.or(...)` tiebreaker; returns `null` when the client is unconfigured. (Mock the chained builder.)
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** all five functions following the `features/team-chat/server/queries.ts` + `features/square/server/queries.ts` (`decorate`→`getPublicUrl`) patterns.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): server queries (feed, latest, comments, unread, admin-check)"`.

## Task 9: Server actions (post/react/comment/view/seen)

**Files:**
- Create: `apps/web/src/features/team-news/server/actions.ts`
- Test: `apps/web/src/features/team-news/server/actions.test.ts`

**Interfaces:**
- Produces (all `actionClient.inputSchema(...).action(...)`, `'use server'`): `createPostAction(createPostSchema) -> { post: NewsPost } | { error }` (insert → on error roll back any uploaded `mediaPath` from the `channel` bucket, like `createClipAction`; on success, fire push fanout — Task 10); `editPostAction`, `deletePostAction`; `reactPostAction(reactPostSchema)` (insert/update/delete on `channel_post_reactions`, emoji null = remove; ignore `23505`); `commentPostAction(commentSchema) -> { comment } | { error }`; `markPostViewedAction(postIdSchema)` (insert into `channel_post_views`, ignore `23505`); `markNewsSeenAction()` (rpc `channel_mark_seen`); `loadOlderNewsAction(cursor)`, `loadOlderCommentsAction({postId, cursor})`.
- Consumes: Tasks 7, 8; `@/lib/safe-action` `actionClient`.

- [ ] **Step 1: Write failing tests** — `reactPostAction({postId, emoji:null})` deletes; `createPostAction` returns `{error}` and calls `storage.remove` when the insert errors (mock); `markPostViewedAction` swallows `23505`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** mirroring `features/team-chat/server/actions.ts` + `features/square/server/actions.ts`. Reaction broadcast + comment broadcast come from DB triggers (Tasks 2/3), so the actions only write rows.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): server actions (post, react, comment, view, seen)"`.

## Task 10: Push fanout on new post

**Files:**
- Modify: `apps/web/src/features/team-news/server/actions.ts` (inside `createPostAction`)
- Create: `apps/web/src/features/team-news/server/notify.ts`
- Test: `apps/web/src/features/team-news/server/notify.test.ts`

**Interfaces:**
- Produces: `notifyNewPost(club: string, post: { id, title, body }): Promise<void>` — resolves recipients by paging `admin.rpc('channel_post_recipients', { p_club: club, p_after, p_limit: 1000 })` (keyset on user_id), collects ids, calls `sendPush(ids, { title: <club name + "עדכון חדש">, body: <title||body truncated>, url: '/stand/chat?tab=news', tag: 'channel:'+club })`. Never throws (wrap in try/catch, log). Called fire-and-forget from `createPostAction` after a successful insert (`void notifyNewPost(...)`).
- Consumes: `@/lib/supabase/admin` `createAdminClient`; `@/features/push/server/send` `sendPush`; `@/features/push/schema` `PushPayload`; Task 5 RPC.

- [ ] **Step 1: Write failing test** — `notifyNewPost` pages recipients until the RPC returns fewer than the page size, then calls `sendPush` once with the union of ids and a payload whose `url` is `/stand/chat?tab=news`; a thrown `sendPush` is swallowed (no rejection). (Mock admin rpc + `sendPush`.)
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `notify.ts` (mirror `recipients()` paging in `features/push/server/dispatch.ts`), wire `void notifyNewPost(...)` into `createPostAction`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): push fanout to club fans on new post"`.

## Task 11: i18n — teamNews namespace

**Files:**
- Modify: `apps/web/messages/{he,en,de,es,fr}.json`
- Test: `apps/web/src/features/team-news/i18n.test.ts` (assert every key present in `he.json` exists in the other four — mirror any existing catalogue-parity test; if none exists, a small test that imports all five and diffs the `teamNews` keys).

**Interfaces:**
- Produces: a `teamNews` namespace (keys: `tabNews`, `tabChat`, `postPlaceholder`, `post`, `titlePlaceholder`, `addPhoto`, `comments` (with `{n}`), `writeComment`, `empty`, `adminOnly`, `views` (with `{n}`), `edited`, `deletePost`, `confirmDelete`, `publish`, `publishing`) in all five files; a `nav.news` label.
- Consumes: next-intl.

- [ ] **Step 1: Write failing test** — key-parity across the five catalogues for `teamNews`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Add** the namespace to `he.json` (real Hebrew) and the other four (translated; English/de/es/fr).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): i18n teamNews namespace + nav label"`.

## Task 12: UI — post reactions control (extracted, shared)

**Files:**
- Create: `apps/web/src/features/team-news/components/post-reactions.tsx`
- Modify (small, optional): `apps/web/src/features/chat/components/chat-room.tsx` — if extracting cleanly, move the reaction-bar/picker/chips JSX into a shared `ReactionControl` used by both; otherwise leave chat-room as-is and build `post-reactions.tsx` independently reusing `Emoji` + the reaction sets.
- Test: `apps/web/src/features/team-news/components/post-reactions.test.tsx`

**Interfaces:**
- Produces: `ReactionControl({ reactions, myReaction, onReact, onDoubleQuick })` — renders the chips (`Emoji` + count), the popular bar (`POPULAR_REACTIONS`), the `+` picker (`MORE_REACTIONS`), double-tap = `QUICK_LIKE`; identical behavior to chat (ED5). `onReact(emoji: string|null)`.
- Consumes: `@/components/emoji` `Emoji`; Task 7 re-exports.

- [ ] **Step 1: Write failing test** — renders chips as `img[src*="/emoji/"]`; a malformed `reactions` prop (non-numeric count) renders nothing for that key and does not throw (Review Focus: garbage payload resilience); double-click calls `onReact('❤️')`; tapping a bar emoji calls `onReact(e)`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the control (lift the JSX from `chat-room.tsx` MessageItem reaction block; keep class names `chat-react-*` so existing CSS applies).
- [ ] **Step 4: Run, verify pass** — `vitest run .../post-reactions.test.tsx`.
- [ ] **Step 5: Commit** — `"feat(channel): shared reaction control (chips, bar, picker)"`.

## Task 13: UI — post card + news feed

**Files:**
- Create: `apps/web/src/features/team-news/components/post-card.tsx`, `news-feed.tsx`
- Test: `apps/web/src/features/team-news/components/post-card.test.tsx`

**Interfaces:**
- Produces: `PostCard({ post, meId, isAdmin, onOpenComments })` — media (`<img>`/`<video>` from `mediaUrl`), title, body, `ReactionControl`, views count, `תגובות (N)` button → `onOpenComments(post.id)`, and (admin) edit/delete. `NewsFeed({ meId, teamId, isAdmin, initial })` — client list seeded from SSR `initial: NewsPost[]`, realtime on `openChannel(supabase, `news:${teamId}`, {private:true})` handling `'INSERT'` (new post → prepend) and `'REACTION'` (update a post's `reactions`), keyset `loadOlderNewsAction`, fires `markPostViewedAction` when a card scrolls into view (IntersectionObserver) and `markNewsSeenAction` on mount.
- Consumes: Tasks 7–9, 12; `@/lib/supabase/{client,channel}`.

- [ ] **Step 1: Write failing test** — `PostCard` renders body text, a `video` when `mediaKind==='video'`, the comments button with the count, and shows edit/delete only when `isAdmin`; a post with `mediaUrl=null` renders no media element.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** both, mirroring `square-feed.tsx` (feed + realtime) and `clip-card.tsx` (media).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): post card + realtime news feed"`.

## Task 14: UI — admin composer

**Files:**
- Create: `apps/web/src/features/team-news/components/post-composer.tsx`
- Test: `apps/web/src/features/team-news/components/post-composer.test.tsx`

**Interfaces:**
- Produces: `PostComposer({ meId, onPublished })` — admin-only (not rendered when `!isAdmin`); title + body inputs + optional media (browser upload to the public `channel` bucket at `${meId}/${uuid}.${ext}` via `shrinkPhoto`, then `createPostAction({ title, body, mediaPath, mediaKind })`); optimistic clear + `onPublished(post)`.
- Consumes: `@/features/square/compress` `shrinkPhoto`; `@/lib/supabase/client`; Tasks 7–9.

- [ ] **Step 1: Write failing test** — publish with empty body is disabled; a successful `createPostAction` clears the inputs and calls `onPublished`; an oversized file (> 50MB) is rejected client-side before upload (Review Focus) with the `teamNews` error string.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** mirroring `features/square/components/upload-clip.tsx` `publish()` (upload-then-create, roll back handled server-side).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): admin post composer (text + media)"`.

## Task 15: UI — post comments thread

**Files:**
- Create: `apps/web/src/features/team-news/components/post-comments.tsx`
- Test: `apps/web/src/features/team-news/components/post-comments.test.tsx`

**Interfaces:**
- Produces: `PostComments({ postId, teamId, meId, isAdmin })` — a focused mini-thread: list (SSR-less; fetches first page via `getPostComments` passed as `initial` or loads on open), composer calling `commentPostAction`, realtime on `openChannel(supabase, `newspost:${postId}`, {private:true})` `'COMMENT'`, keyset `loadOlderCommentsAction`, admin may delete any comment. Opens as a sheet/overlay from `PostCard`'s comments button.
- Consumes: Tasks 7–9; realtime.

- [ ] **Step 1: Write failing test** — renders fetched comments; submitting appends optimistically and calls `commentPostAction`; a `'COMMENT'` broadcast for this `postId` appends; a malformed broadcast is ignored (no throw).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** (a trimmed `ChatRoom`-like thread, or a bespoke list+composer — bespoke is fine; it is one-level, no replies in MVP).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): per-post comment thread view"`.

## Task 16: UI — tabs on the chat page + pinned latest post

**Files:**
- Modify: `apps/web/src/app/(app)/stand/chat/page.tsx`
- Create: `apps/web/src/features/team-news/components/pinned-post.tsx`, `apps/web/src/features/team-news/components/news-tabs.tsx`
- Test: `apps/web/src/features/team-news/components/news-tabs.test.tsx`

**Interfaces:**
- Produces: `NewsTabs({ chat, news, unread, initialTab })` — News|Chat tabs following the `MatchTabs` pattern (both panels rendered, inactive `hidden`, `?tab=` synced), News tab shows an unread dot from `unread`. `PinnedPost({ post, onOpenComments })` — the latest channel post rendered as a compact pinned card atop the chat panel with a `תגובות (N)` button (ED1). Page change: `ChatScreen` fetches `getTeamNews()`, `getLatestPost()`, `getChannelUnread()`, `amIChannelAdmin()` in parallel with the existing chat data, and renders `<NewsTabs chat={<><PinnedPost/> <TeamChat/></>} news={<PostComposer/> + <NewsFeed/>} .../>` honoring `searchParams.tab`.
- Consumes: Tasks 8, 13–15; `features/matches/components/match-tabs.tsx` (pattern), `features/me/components/profile-tabs.tsx` (fallback).

- [ ] **Step 1: Write failing test** — `NewsTabs` renders both panels with the inactive one `hidden`; `initialTab='news'` shows the news panel; `unread` renders the dot; switching tabs does not unmount the chat panel (assert the chat node stays in the DOM).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `NewsTabs` (MatchTabs pattern), `PinnedPost`, and wire the page.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"feat(channel): News|Chat tabs + pinned latest post in chat"`.

## Task 17: Activity bell — channel_post notice (optional, light)

**Files:**
- Modify: `apps/web/src/features/activity/activity.ts` (add `channel_post` to `ACTIVITY_KINDS`, `activityLine`, `activityHref`) and `components/activity-rows.tsx` (icon branch) — **only if** we decide the push + unread dot (ED2) is not enough. Default: **skip** per ED2; this task is a placeholder the owner can approve later.

- [ ] If approved: add the kind end-to-end with its own trigger (bounded — e.g. only notify fans active in the last N days) + tests. Otherwise delete this task. (No code by default.)

## Task 18: Verification before completion

- [ ] **Step 1:** Push the branch; dispatch `web-ci.yml` and `web-db.yml`; confirm both green (build, typecheck against regenerated types, lint, unit, Playwright smoke; pgTAP on a fresh DB).
- [ ] **Step 2:** Read any failure via the `ci-step.sh` annotations route (CLAUDE.md).
- [ ] **Step 3:** Apply migrations 1–6 to **staging**, verify schema, then **production**; record in `schema_migrations`.
- [ ] **Step 4:** Open the preview at 375px: News tab (feed, post card, reactions crisp Twemoji, views, comments button), admin composer (as an admin account; a non-admin sees no composer), comment thread, Chat tab with the pinned post, unread dot. Confirm no horizontal overflow and no `באג פריסה` bar on home/chat/Square/inbox/my-card/trips (owner's standing rule).
- [ ] **Step 5:** Merge to `main` (sync first), watch CI green + Vercel deploy, verify on production at 375px.
- [ ] **Step 6:** Update `docs/COMPANY.md` (done list + bump date) and seed the first per-club admin rows by hand in the SQL editor for launch clubs.

---

## Self-review notes

- **Spec coverage:** admin-authored rich posts (T1,13,14); post in channel + pinned in chat (T16, ED1); emoji reactions (T2,12, reusing shipped model); per-post comment threads (T3,15); realtime (T2,3,13,15); push on every post (T5,10); unique views (T4); per-club admins via `team_channel_admins`, owner-seeded (T1,18); scale via keyset/triggers/CDN/bounded fanout (throughout). Non-goals respected (no bot/API, no cross-club, no self-grant admin UI, no reply-to-comment).
- **Deviations stated as ED1–ED6** (cross-post mechanism, in-app notice, push path, bucket privacy, reaction reuse, tab mounting) — each a builder-visible decision.
- **Open spec items resolved:** default reaction set = the shipped `POPULAR_REACTIONS`; reply-to-comment = no (MVP); one media per post; admin edit/delete = yes.
- **Type consistency:** `NewsPost`/`NewsComment` and the Zod schemas defined in T7 are the single source consumed by T8–T16; reaction sets re-exported, not redefined.
