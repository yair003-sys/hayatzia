# Private messages across the whole league, message requests and a personal QR code: design

Status: approved by the owner in chat on 2026-10-16 ("כן"; answers to the builder check the same evening). Owner's words: "אני רוצה שהצאט הפרטי יהיה
אפשרות גם לדבר עם אוהדים של קבוצות אחרות … זה קריטי". Engineering calls are Claude's, stated to the owner.

## Why
Rivalry and engagement between fan bases is onefan's difference (the whole league in one place). Today a private
message is possible only between fans of the same club (`same_team` in `dm_threads_stamp`, `device_keys_read`). Fans
of different clubs meet in the match room and at the stadium; they must be able to talk in private.

## Owner's decisions (product)
1. Private 1:1 messages are open across the whole league, not only within a club.
2. Entry point in chat: in the match room (and the team chat), tapping the round avatar of a message's sender opens
   "שלח הודעה פרטית" to that fan. Works for fans of the rival club too.
3. No approval before sending. The first message arrives as a **message request** in the recipient's inbox. Opening
   it shows who sent it and the message; at the bottom: **"אשר והמשך שיחה"** or **"חסום"** (plus "דווח").
4. A personal QR code in the private chat area ("הברקוד שלי"): another fan scans it at the stadium and can add / message
   them directly.
5. **Birth date at sign-up** (owner, 2026-10-16: "בהרשמה צריך לציין … תאריך לידה"). Required on sign-up; under 16
   cannot register (replaces the "16+" checkbox). Existing fans are asked once on their next visit. Private: never
   shown to other fans; the database derives "adult" (18+) from it. Rides use it instead of the 18+ tap
   (`adult_confirmed_at` stays as legacy and is no longer the source). Self-declared.
6. Guard for minors: a setting "מי יכול לשלוח לי בקשות" with כולם / רק אוהדי הקבוצה שלי / רק דרך ברקוד.
   Default "כולם" for 18+; default "רק אוהדי הקבוצה שלי" (plus QR) for 16–17 (derived from the birth date). The
   fan can change it.
7. **No report with message content** (owner: "פשוט הוא יחסום את המשתמש וזהו"). The request screen offers
   "אשר והמשך שיחה" and "חסום" only. No DM text ever reaches the server.
8. **QR = consent** (owner: "כן"). A thread opened by scanning a fan's code starts already accepted, works under
   any request setting, is outside the daily cap; only a block (either way) or a ban stops it.
9. Rides need stronger driver verification later (owner); out of scope here, tracked in `docs/COMPANY.md`.

## Claude's engineering calls
- **One message before acceptance.** Until the recipient accepts, the sender can send only the first message in that
  thread (rule in the database). After acceptance both sides write freely (existing rate limits stay).
- **Daily cap on new requests:** at most 20 new requests per sender per 24 h, and at most 5 per 24 h for an account
  younger than 3 days (database rule, `rate_limit`). Same-club threads that already exist are not affected.
- **Decline = block.** "חסום" uses the existing `blocks` table; a declined request is not shown again and the sender
  cannot send another. Ignoring a request leaves it pending; the sender still cannot add a second message.
- **Accept** stamps `accepted_at` on the thread (only the recipient can set it, once). A thread is a request while
  `accepted_at` is null and the recipient has not replied. Threads that exist today count as accepted (migration
  backfills `accepted_at = created_at`), so nothing changes for current users.
- **Same-club threads too:** the request step applies to every new thread, same club or not, so the experience is one
  rule. (Keeps the code simple; the owner can relax it later.)
- **Who may start a thread** (checked in `dm_threads_stamp`, replacing `same_team`): not blocked either way, the
  recipient's request setting allows it (`everyone`; `team` → same club; `qr` → the thread is opened through a valid
  QR code of the recipient), and the daily cap.
- **QR code:** each fan has a random code (`profiles.qr_code`, 22+ url-safe characters, unique, stamped by the
  database), never the user id. The QR encodes `https://<site>/add/<code>`; scanning with any phone camera opens that
  page (sign-in first if needed), which shows the fan's card (nick, club, avatar) and "שלח הודעה". The fan can reset
  the code ("חדש ברקוד"); the old one stops working at once. Opening a thread through a code is done by a security
  definer RPC `open_dm_by_code(code)` that resolves the code server-side, opens (or returns) the thread already
  accepted, bypasses the request setting and the daily cap, never blocks or bans. In-app scanning uses the browser's camera through a file/camera input or `BarcodeDetector` where
  supported, with the phone camera as the always-working path; no new npm dependency unless needed (if a QR
  *generator* library is needed, add it through `web-deps.yml`).
- **Encryption stays end to end.** The first message is encrypted like any other. To encrypt to a fan of another
  club the sender must read the recipient's public device keys: `device_keys_read` changes from `same_team(user_id)`
  to "a thread exists between us, or I am allowed to start one with them" (security definer helper
  `private.can_dm(other)`), so keys are not enumerable by everyone. No plaintext reaches the server, push included.
- **Push and inbox:** a request sends a push "בקשת הודעה מ-<nick>" with no message text, using the existing push
  pipeline and its throttle. The inbox shows a "בקשות" section (count badge) above the normal threads; a request row
  shows the sender's nick and club colours. Message text is decrypted on the device as today.
- **Blocks as a signal:** since there is no DM report, the admin screen shows fans blocked by many distinct fans in
  the last 30 days (a count by trigger, no content), so a serial harasser can be banned.
- **Birth date:** `profiles.birth_date date` (check: ≥ 16 years old at insert / first set, not in the future, not
  before 1900), set once by the fan (column grant for the first set only; changes go through support later),
  never readable by other fans (column-level select, like gender). `private.is_adult(user)` derives 18+. The
  sign-up form and a one-time prompt for existing fans (no birth date yet) collect it; until then a fan cannot
  open new private threads or offer/request rides (existing threads keep working).
- **Request setting storage:** `profiles.dm_requests` text check in ('everyone','team','qr') nullable; null means
  the age-based default, computed at check time (so a fan who turns 18 moves to "everyone" unless they chose).
- **Groups stay same-club** (unchanged); only 1:1 threads open to the league. Banned fans (`fan_bans`) cannot start
  threads: add the ban check to `dm_threads_stamp` and `open_dm_by_code`. `private.can_dm` for device keys also
  allows "we share a group", so groups keep working whatever the request setting.
- Chat messages show no sender avatar today: add one (the button) to the match room and team chat rows.
- **Scale:** indexes for the new lookups (`profiles(qr_code)` unique; request listing by recipient and `accepted_at`;
  the daily cap counts by `(user_a|user_b, created_at)` using existing thread indexes or a sender column). No N+1 in
  the inbox: requests come in the same keyset-paginated query.
- **Tests:** pgTAP for every rule (cross-club thread allowed, one message before accept, accept only by recipient,
  decline/block stops further messages, request setting `team`/`qr`, QR reset invalidates, daily cap, device keys
  readable only when allowed, existing threads backfilled as accepted). Vitest for the client helpers and Hebrew error
  mapping; Playwright smoke for the inbox requests section if feasible.

## UI (Hebrew, RTL, current look)
- Match room / team chat: the sender's avatar is a button (`aria-label="שלח הודעה פרטית ל-<nick>"`), opens a small
  sheet: nick, club, "שלח הודעה פרטית"; for oneself nothing.
- Thread screen for a request (recipient): the message, the sender's card, a sticky bar "אשר והמשך שיחה" /
  "חסום".
- Sign-up: a birth date field (day / month / year, RTL), with the reason in one line ("כדי להגן על בני נוער. לא
  מוצג לאף אחד"). One-time sheet for existing fans with the same field. Sender side before acceptance: the composer shows "ההודעה נשלחה. אפשר לכתוב שוב כשיאשרו" and is
  disabled.
- Inbox: "בקשות (N)" row at the top opening the requests list.
- "הברקוד שלי" button in the private messages screen: big QR, nick, "חדש ברקוד", and "סרוק ברקוד".
- Settings in "הכרטיס שלי": "מי יכול לשלוח לי בקשות" with the three options.
- `/add/<code>` page.

## Non-goals
Group chats across clubs, message search, read receipts, disappearing messages, ID verification.

## Docs to update in the same work
`docs/DATA_MODEL.md`, `docs/COMPANY.md` (decision + done), legal privacy page draft mention that DMs are open
league-wide (for the lawyer), `docs/ROADMAP.md`.
