# Messages like Telegram + small groups: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Telegram-style inbox (avatars, decrypted previews, unread counts, search, "+" sheet) and end-to-end encrypted invite-only groups of up to 20 fans of one club.

**Architecture:** Postgres owns membership, invites, limits, counters and realtime fan-out (triggers + security-definer RPCs, RLS, pgTAP). The browser owns all message content: it encrypts with the existing `encryptMessage` for every device of every member, and decrypts previews and threads on the device. Server components read metadata only.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, RLS, Realtime broadcast), next-safe-action, zod, WebCrypto (`src/lib/e2e`), Vitest, pgTAP, Playwright smoke. CI is the only build machine (`web-ci.yml`, `web-db.yml`).

**Spec:** `docs/superpowers/specs/2026-10-13-messages-groups-design.md`

## Global Constraints
- No plaintext of any message reaches the server: no server action, query, log or push carries message text.
- Groups: same club only; max **20** fans including pending invites; only the admin invites/removes/renames; anyone leaves; invites expire after **7 days**; joining needs the invited fan's yes; `joined_at` = accept time.
- Group name 2–40 characters; members picked per create/invite call: 1–19.
- Every query indexed and bounded; counters by trigger; no N+1 (previews and nicknames in single `in()` queries).
- Hebrew UI copy in the clean style (Heebo 600 titles, `t-page`/`t-sec`/`t-num`, no emojis in headings).
- Migration applied to staging (Claude) then production (owner clicks Run).

## Review Focus
1. A fan removed from a group must not receive keys for later messages: the sender builds the device list from **current** members at send time (test in Task 5).
2. A member who accepted after a message was sent must not read it (RLS on `joined_at`; pgTAP in Task 2).
3. Two members who block each other: the blocker stops seeing the blocked fan's group messages (pgTAP in Task 2).
4. The 21st fan (member or pending) is refused, including two concurrent invites (row lock; pgTAP in Task 2).
5. A device that cannot decrypt a preview shows "הודעה מוצפנת", never an error or a blank row (unit test in Task 1, component in Task 4).

---

### Task 1: Pure helpers for the inbox and groups

**Files:**
- Modify: `apps/web/src/features/dm/schema.ts`
- Test: `apps/web/src/features/dm/schema.test.ts`

**Interfaces:**
- Produces:
  - `GROUP_MAX = 20`, `INVITE_DAYS = 7`
  - `groupNameSchema` (trim, 2–40), `createGroupSchema = { name, memberIds: uuid[] 1–19 unique }`, `inviteSchema = { groupId: uuid, memberIds: uuid[] 1–19 }`, `groupMemberSchema = { groupId, userId }`, `groupIdSchema = { groupId }`, `renameSchema = { groupId, name }`, `muteSchema = { groupId, muted: boolean }`
  - `type InboxRow = { kind: 'dm' | 'group'; id: string; name: string; otherId: string | null; lastAt: string; lastFrom: string | null; lastMessageId: string | null; unread: number; members: number | null; muted: boolean }`
  - `type Invite = { groupId: string; name: string; invitedBy: string; members: number; invitedAt: string }`
  - `avatarOf(id: string, name: string): { initial: string; hue: number }` (first letter of the name, hue 0–359 stable per id)
  - `unreadLabel(n: number): string | null` (0 → null, 1–9 → "n", ≥10 → "9+")
  - `previewText(p: { text: string | null; senderNick: string | null; mine: boolean; group: boolean }): string` — null text → "הודעה מוצפנת"; mine → prefix "אתה: "; group + other → "<nick>: …"; collapses whitespace, max 60 chars with "…"
  - `filterInbox(rows: InboxRow[], q: string): InboxRow[]` (case-insensitive name contains)

- [ ] **Step 1: Write failing tests** in `schema.test.ts` (`describe('inbox helpers')`): `unreadLabel(0)===null`, `unreadLabel(3)==='3'`, `unreadLabel(12)==='9+'`; `avatarOf('abc','דני').initial==='ד'` and same id → same hue, hue in [0,360); `previewText({text:null,…})==='הודעה מוצפנת'`; `previewText({text:'נפגשים בשער 5',senderNick:'דני',mine:false,group:true})==='דני: נפגשים בשער 5'`; mine → `'אתה: …'`; 80-char text → length 61 ending "…"; `createGroupSchema` rejects 20 member ids and duplicate ids, accepts 19; `groupNameSchema` rejects 'א' and 41 chars; `filterInbox` matches 'מכב' in 'מכבי בדרך'.
- [ ] **Step 2: Push and confirm the new tests fail in CI** (`web-ci.yml` unit step).
- [ ] **Step 3: Implement the helpers** listed above in `schema.ts`.
- [ ] **Step 4: CI unit step passes.**
- [ ] **Step 5: Commit** `feat(dm): inbox and group helpers`.

### Task 2: Database: groups, invites, counters, previews, realtime

**Files:**
- Create: `apps/web/supabase/migrations/20261013100000_dm_groups.sql`
- Create: `apps/web/supabase/tests/database/dm_groups.test.sql`
- Modify: `apps/web/src/lib/supabase/database.types.ts` (hand-add the new tables/RPCs in the generated shape, as done for earlier migrations)

**Interfaces:**
- Produces (tables): `dm_groups(id, team_id, name, created_by, created_at, last_at, last_from, last_message_id, members_count)`; `dm_group_members(group_id, user_id, role 'admin'|'member'|'invited', invited_by, invited_at, joined_at, unread, muted)`; `dm_group_messages(id, group_id, sender_id, sender_device, iv, ciphertext, wrapped_keys, created_at)`; `dm_group_events(id, group_id, kind 'join'|'leave'|'remove'|'rename', actor, subject, created_at)`; `dm_threads` + `last_message_id uuid`, `unread_a int default 0`, `unread_b int default 0`.
- Produces (RPCs, security definer, `search_path=''`, granted to `authenticated`): `create_group(p_name text, p_members uuid[]) returns uuid`; `invite_to_group(p_group uuid, p_members uuid[])`; `answer_invite(p_group uuid, p_yes boolean)`; `remove_from_group(p_group uuid, p_user uuid)`; `leave_group(p_group uuid)`; `rename_group(p_group uuid, p_name text)`; `mute_group(p_group uuid, p_muted boolean)`; `mark_read(p_kind text, p_id uuid)`.
- Error codes (raised as `P0001` messages, mapped in Task 3): `not_admin`, `not_member`, `group_full`, `not_same_team`, `blocked`, `invite_expired`, `bad_name`.

Rules to encode (all asserted in pgTAP):
- `create_group`: caller becomes `admin` with `joined_at=now()`, each member row `invited`; same club (`same_team`), no block between the invitee and **any** current member/invitee, total ≤ 20 (lock the group row `for update`), `members_count` counts admin+members only.
- `answer_invite(yes)`: invited and `invited_at > now()-7 days` → `member`, `joined_at=now()`, event `join`; `no` or expired → row deleted.
- `remove_from_group`: admin only; event `remove`. `leave_group`: any; if the leaver was the only admin, the earliest-joined member becomes admin; group deleted when no `admin`/`member` rows remain. Event `leave`.
- Messages: insert only by a `member`/`admin` (before-insert trigger, stamps `sender_id`, `created_at`, ≤ 60 `wrapped_keys`, same 10-per-10-seconds limit as DMs). Select: caller is `member`/`admin` with `created_at >= joined_at`, and no block from caller to sender.
- After-insert on group messages: group `last_at/last_from/last_message_id`; `unread = unread + 1` for every other `member`/`admin`; `realtime.broadcast_changes('grp:'||group_id …)`; `realtime.send({group_id, from}, 'message', 'inbox:'||member)` per member. Invites send `realtime.send({group_id}, 'invite', 'inbox:'||invitee)`.
- `dm_messages_after` (replace): also sets `last_message_id`, increments the other side's `unread_a/unread_b`.
- `mark_read('dm'|'group', id)`: zeroes the caller's counter (membership checked).
- Realtime policy: add `grp:<id>` for `member`/`admin` rows (keep existing `inbox:`/`dm:` clauses).
- Column grants: no direct insert/update/delete on `dm_groups`/`dm_group_members`/`dm_group_events` (RPCs only); `select` via RLS to rows of groups the caller is in (invitees may read their invite's group name/count); `insert (group_id, sender_device, iv, ciphertext, wrapped_keys)` on `dm_group_messages`.
- Indexes: `dm_group_members (user_id, group_id)`, `dm_group_messages (group_id, created_at desc, id desc)`, `dm_group_events (group_id, created_at)`.

- [ ] **Step 1: Write `dm_groups.test.sql`** (users a,b,c,d same club, e other club; ~22 assertions): create with b,c → a admin, b/c invited, members_count 1; invite e → `not_same_team`; b blocked by a-member → `blocked`; 20-cap with 19 invitees ok then 1 more `group_full`; b accepts → member, joined_at set, event join; c declines → row gone; expired invite (update invited_at −8 days as superuser) → `invite_expired`; non-admin b invites → `not_admin`; b sends message → visible to a, not to c (declined), not to d invited later then accepted (joined after); a removes b → b no longer reads new messages and cannot insert; a leaves → earliest member admin; last leaves → group deleted; unread increments for others and `mark_read` zeroes it; DM after-insert sets `last_message_id` and other side's unread; block between members hides sender's messages from the blocker.
- [ ] **Step 2: Push; `web-db.yml` fails** (tables missing).
- [ ] **Step 3: Write the migration** per the rules above.
- [ ] **Step 4: `web-db.yml` green** (all pgTAP files).
- [ ] **Step 5: Apply on staging** (SQL editor) and verify `select count(*) from dm_groups` runs; commit `feat(db): encrypted small groups with invites`.

### Task 3: Server: inbox query and group actions

**Files:**
- Modify: `apps/web/src/features/dm/server/queries.ts`, `apps/web/src/features/dm/server/actions.ts`, `apps/web/src/features/push/server/actions.ts`
- Test: `apps/web/src/features/dm/schema.test.ts` (error mapping)

**Interfaces:**
- Consumes: Task 1 types/schemas; Task 2 tables/RPCs.
- Produces:
  - `getInbox(userId): Promise<{ rows: InboxRow[]; invites: Invite[] }>` — one query for threads (limit 100), one for my group memberships joined to groups (limit 100), blocks filter as today, merged and sorted by `lastAt` desc.
  - `getGroup(groupId, userId): Promise<{ id; name; role: 'admin'|'member'; muted: boolean; members: { userId; nick; role }[] } | null>` (members + nicknames in two queries).
  - Actions (next-safe-action): `createGroupAction(createGroupSchema) → redirect('/inbox/g/'+id)`, `inviteAction(inviteSchema)`, `answerInviteAction({groupId, yes})` (yes → redirect to the group), `removeMemberAction(groupMemberSchema)`, `leaveGroupAction(groupIdSchema) → redirect('/inbox')`, `renameGroupAction(renameSchema)`, `muteGroupAction(muteSchema)`, `markReadAction({ kind, id })`, `notifyGroupAction({ groupId })` (push to non-muted members except me: title "הודעה חדשה בקבוצה", body `<group name> · מ־<my nick>`, url `/inbox/g/<id>`, tag `grp:<id>`; never message text).
  - `groupErrorHe(code: string): string` in `schema.ts`: `group_full`→"הקבוצה מלאה (עד 20 אוהדים)", `not_admin`→"רק מנהל הקבוצה יכול לעשות את זה", `blocked`→"אי אפשר להוסיף את האוהד הזה", `not_same_team`→"אפשר להזמין רק אוהדים מהקבוצה שלך", `invite_expired`→"ההזמנה פגה", default "הפעולה נכשלה. נסה שוב".

- [ ] **Step 1: Failing unit test** for `groupErrorHe` (each code above + unknown).
- [ ] **Step 2: Implement** `groupErrorHe`, queries and actions.
- [ ] **Step 3: CI typecheck/lint/unit green.** Commit `feat(dm): inbox query and group actions`.

### Task 4: Telegram-style inbox

**Files:**
- Create: `apps/web/src/features/dm/components/inbox-list.tsx` (client), `apps/web/src/features/dm/components/new-sheet.tsx` (client), `apps/web/src/features/dm/components/invite-card.tsx` (client), `apps/web/src/features/dm/components/avatar.tsx`, `apps/web/src/features/dm/use-device-key.ts` (shared hook: load/publish key, `devicesOf(userIds)`, `reveal(rows)`) 
- Modify: `apps/web/src/app/(app)/inbox/page.tsx`, `apps/web/src/features/dm/components/inbox-live.tsx` (also refresh on `invite`), `apps/web/src/app/globals.css` (`.ib-*`)
- Delete: `apps/web/src/features/dm/components/new-conversation.tsx` (folded into `new-sheet`)

**Interfaces:**
- Consumes: `getInbox`, Task 1 helpers, actions from Task 3, `useDeviceKey` (also used by Task 5).
- Produces: `useDeviceKey(meId): { key: DeviceKey | null; status: string | null; devicesOf(userIds: string[]): Promise<(PublicDevice & { user_id: string })[]>; reveal<T extends EncryptedRow>(rows: T[]): Promise<(T & { text: string | null })[]> }` where `EncryptedRow = EncryptedMessage & { id; sender_id; created_at }`.

Behaviour: header "הודעות" + lock line; search input filters with `filterInbox`; invite cards on top (accept/decline); rows = `Avatar` (initial on `hsl(hue 55% 38%)`, group → Users icon) + name + preview (fetch `dm_messages`/`dm_group_messages` by `lastMessageId` in one `in()` per kind, `reveal`, `previewText`) + `chatTime(lastAt)` + unread badge (`unreadLabel`, muted → grey badge); floating "+" → bottom sheet (portal) with "שיחה חדשה" (teammate search → `openThreadAction`) and "קבוצה חדשה" (name + multi-select chips, cap 19, `createGroupAction`); empty state with both actions. Links: dm → `/inbox/<id>`, group → `/inbox/g/<id>`.

- [ ] **Step 1: Build components and page** as above (UI; logic lives in Task 1 helpers).
- [ ] **Step 2: CI green.** Then on the staging preview (signed in as the owner's staging account): create a group inviting two demo fans, see it in the list with "0 הודעות" preview, search filters, invite card renders for a pending invite (verify via screenshot).
- [ ] **Step 3: Commit** `feat(dm): Telegram-style inbox with groups and invites`.

### Task 5: Group chat and group info

**Files:**
- Create: `apps/web/src/app/(app)/inbox/g/[id]/page.tsx`, `apps/web/src/app/(app)/inbox/g/[id]/info/page.tsx`, `apps/web/src/features/dm/components/group-thread.tsx` (client), `apps/web/src/features/dm/components/group-info.tsx` (client)
- Modify: `apps/web/src/features/dm/components/dm-thread.tsx` (use `useDeviceKey`; header avatar; call `markReadAction({kind:'dm', id})` on open and on each received message)
- Test: `apps/web/src/features/dm/schema.test.ts` (`recipientsFor`)

**Interfaces:**
- Consumes: `getGroup`, `useDeviceKey`, Task 3 actions, `encryptMessage`.
- Produces: `recipientsFor(members: { userId: string; role: string }[], blockedByMe: string[]): string[]` in `schema.ts` — user ids of current `admin`/`member` rows (never `invited`), excluding fans I blocked; always includes me.

Behaviour: group thread like the DM thread, reading `dm_group_messages` (page 50) and `dm_group_events` merged by time as system lines ("דני הצטרף", "יוסי עזב", "המנהל הוציא את רון", "שם הקבוצה שונה"); other people's bubbles show the nick (colour = `avatarOf(userId).hue`); live on channel `grp:<id>`; on send: re-fetch members (`getGroup` via a small action or direct select) → `recipientsFor` → `devicesOf` → `encryptMessage` → insert → `notifyGroupAction`. Members whose devices are missing still get the message later only from new messages (no warning needed). Header: avatar + name + "N חברים" → info. Info page: members with admin badge; admin: invite (teammate search, multi-select), remove, rename; everyone: mute toggle, leave (confirm in-page); report/block per member via existing `ReportBlock`.

- [ ] **Step 1: Failing test** `recipientsFor`: excludes `invited`, excludes blocked, includes me, de-duplicates.
- [ ] **Step 2: Implement** `recipientsFor`, pages and components.
- [ ] **Step 3: CI green.** On staging: send a group message from the owner's account → appears decrypted, preview in the inbox shows "אתה: …", unread badge on a second device/account is out of reach, so assert counters with pgTAP (Task 2) instead.
- [ ] **Step 4: Commit** `feat(dm): group chat and group info`.

### Task 6: Ship

- [ ] **Step 1:** Update `docs/DATA_MODEL.md` (new tables, RPCs, counters) and `docs/ROADMAP.md`.
- [ ] **Step 2:** Load the migration in the production SQL editor for the owner; after his Run, check `/inbox` on production renders (empty list + "+" sheet).
- [ ] **Step 3:** Whole-branch review by a fresh reviewer (requesting-code-review), fix findings, CI green, commit and push.
