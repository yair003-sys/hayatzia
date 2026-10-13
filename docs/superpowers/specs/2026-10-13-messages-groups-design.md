# Messages like Telegram, with small invite-only groups: design

Status: owner-approved direction, 2026-10-13.

## Intent
The Messages tab (`/inbox`) looks bare: a title, a "new conversation" button and plain rows with a nickname and a time. The owner wants it **like Telegram**: a real chat list, plus **small groups of invited fans** (the friends who travel to games together, who sit together in the stand). Private messages stay end-to-end encrypted (standing rule: no path may send plaintext to the server). Groups are encrypted the same way.

## Owner decisions
- Telegram-style list. (owner)
- Groups are **small and invite-only**, **up to 20 fans**. (owner)
- Claude's calls, said to the owner and not objected to: only fans of the same club (as DMs today); the fan who opens a group is its admin; **only the admin adds or removes** members; anyone can leave; a new member sees only messages sent after joining (inherent to the encryption).

- Claude's calls after the builder check:
  - **Blocks:** a fan cannot be added if a block exists between them and any current member. If two members block each other later, both stay; the blocker no longer receives the blocked fan's messages (RLS hides them) and their own messages are not wrapped for the blocked fan's devices.
  - **Push and mute:** group messages push like DMs (no content), and every member can mute a group from group info (`muted` on the membership row; the push sender skips muted members).
  - **Re-added member:** a new membership with a new `joined_at`; history from the earlier membership is not readable again.
  - **Members without a device key yet:** the message is still sent; they see "הודעה שנשלחה לפני שהמכשיר הזה הופעל" for messages not wrapped for their device (as in DMs today).

## Behaviour
### Inbox (`/inbox`)
- Header: "הודעות" (clean type), a search field (filters the list by name on the device), the line "מוצפן מקצה לקצה" with a lock.
- One list, newest first, of 1:1 chats and groups mixed. Each row: round avatar (initial on a colour derived from the id; groups show a people icon), name, the **last message preview decrypted on the device** (or "הודעה מוצפנת" if this device cannot read it; groups prefix the sender's nick: "דני: נפגשים בשער 5"), time, and an **unread count** badge (9+ cap).
- Floating round "+" button → bottom sheet: "שיחה חדשה" (existing teammate search) / "קבוצה חדשה".
- Empty state: full illustration-free invite, "עוד אין שיחות" + the two actions.

### New group
Sheet / page: group name (2–40 chars), pick members from the club (same teammate search, multi-select chips, up to 19 besides me), "פתיחת הקבוצה". Opens the group.

### Group chat (`/inbox/g/[id]`)
- Header: avatar, name, "N חברים"; tap → group info.
- Messages like the DM thread, with the sender's nick above other people's bubbles (colour per member), my bubbles plain.
- Group info: members list (admin badge), admin can add (search) and remove; everyone can leave; admin can rename. Report/block stays per member (existing ReportBlock).
- A system line in the chat when someone joins, leaves or is removed ("דני הצטרף", plaintext of names only, no message content).

### 1:1 chat
Unchanged behaviour; restyled header to match (avatar + name), and it now resets its unread counter when opened.

## How it gets made (Claude's calls)
### Data (one migration, RLS, explicit column grants, pgTAP)
- `dm_groups(id uuid pk, team_id stamped, name 2–40, created_by, created_at, last_at, last_from, last_message_id, members_count)`; index `(team_id)`.
- `dm_group_members(group_id, user_id, role 'admin'|'member', joined_at, unread int default 0, pk(group_id,user_id))`; index `(user_id, group_id)`. Trigger: same club as the group, not blocked by/with the adder, max 20 (row lock on the group), only the admin inserts others or deletes others; a member may delete themselves (leave); last admin leaving hands admin to the earliest member; group deleted when empty. `members_count` kept by trigger.
- `dm_group_messages(id, group_id, sender_id stamped, sender_device, iv, ciphertext ≤ 4000, wrapped_keys jsonb (size-capped), created_at)`; index `(group_id, created_at desc, id desc)`. Insert only by a member (trigger, same rate limit as DMs). Read: members only, and only messages with `created_at >= joined_at` (RLS).
- `dm_group_events(id, group_id, kind join|leave|remove|rename, actor, subject, created_at)` for the system lines (no content).
- After-insert trigger on messages: `last_at/last_from/last_message_id` on the group, `unread = unread + 1` for every other member (≤ 19 rows), `realtime.broadcast_changes('grp:<id>')`, `realtime.send(... 'inbox:<member>')` per member. Realtime policy extended for `grp:` topics (members only).
- 1:1 unread + preview: add `dm_threads.last_message_id`, `unread_a`, `unread_b` kept by the existing after-insert trigger; an RPC `mark_read(kind, id)` zeroes the caller's counter (security definer, checks membership).
### Encryption
No new crypto. Group messages use the existing `encryptMessage`: a fresh AES-GCM key per message, wrapped for every device of every current member (≤ 20 fans × their devices). Device keys of members are readable because members are same-club (existing `device_keys_read` policy). Previews: the inbox fetches the last message of each row in **one** `in()` query per kind and decrypts on the device.
### App
- `features/dm`: extend queries (`getInbox` merging threads and groups, one query each + one previews query + nicknames), actions (create group, add/remove/leave/rename, mark read, send group message), components (`inbox-list` client with search + previews, `new-sheet`, `group-thread`, `group-info`). Reuse `dm-thread` internals where possible.
- Pure helpers with unit tests: avatar colour/initial, preview text, unread label, group name validation, member limit.
### Scale
Every list query is indexed and bounded; counters by trigger; no N+1 (previews and nicknames in single `in()` queries).

## Non-goals
Big/public groups, discovery, media in groups, reactions, message editing/deletion, cross-club groups, pinned chats, folders.

## Anti-goals
Any plaintext of a message reaching the server; a removed member receiving keys for new messages; a non-admin adding people; groups over 20.
