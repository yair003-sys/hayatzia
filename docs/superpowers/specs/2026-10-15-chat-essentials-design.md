# Chat essentials (WhatsApp-like): design

Status: requested by the owner 2026-10-15. Engineering calls are Claude's, stated to the owner.

## Owner's request
1. Every message shows the time it was sent, and my own messages show two ticks once sent.
2. Coming back to a chat opens where I stopped reading, with a divider line above the first unread message.
3. A "go down" arrow button to jump to the bottom.
4. Tap a message to reply to it; the reply shows which message it answers.

## Where
All four chat screens: the club team chat and the match room (shared `ChatRoom`), private messages and groups
(`dm-thread`, `group-thread`, `thread-parts`). Private messages stay end-to-end encrypted: nothing new may send their
text to the server.

## Claude's calls
- Ticks: one grey tick while the message is being sent, two grey ticks once the server saved it, an error mark with
  "נסה שוב" when it failed. (Read receipts, blue ticks, are out of scope; a later option for private chats only.)
- Time: HH:MM in Israel time under every message (already partly there; make it consistent on all four screens),
  with a day separator ("היום", "אתמול", or the date) between days.
- Last-read position: kept per chat on the device (localStorage, wrapped in try/catch) as the id + time of the last
  message the fan saw; on entering, scroll to the first newer message and show a divider "N הודעות שלא נקראו"; with
  nothing new, open at the bottom. Leaving / hiding the page or scrolling to the bottom updates it.
- Jump button: a round arrow-down button floating above the typing box (bottom-end corner), with a badge of new
  messages that arrived while scrolled up; hidden at the bottom. Replaces the current text pill.
- Reply:
  - Public chats: new nullable columns `reply_to uuid` plus server-stamped snapshot `reply_nick`, `reply_body` (first
    80 characters, after moderation) on team_messages and match_messages, stamped by a BEFORE INSERT trigger that
    checks the replied message is in the same chat (same club / same fixture) and visible to the sender; a fan can't
    set the snapshot fields. The snapshot means no extra queries to render (no N+1) and still works when the original
    is not loaded.
  - Private messages and groups: a nullable `reply_to uuid` column only (same thread / group, checked by trigger); the
    quoted text is found and decrypted on the device from the loaded messages, or shows "הודעה קודמת" when not loaded.
  - UI: tap (or long-press on touch) a message → a small "השב" action; the composer shows a quoted bar with the nick
    and text and an ✕; the sent message shows the quote above its text; tapping the quote scrolls to the original
    when it is loaded and flashes it.
- Accessibility: ticks have text alternatives ("נשלח", "בשליחה"), the divider is announced, the jump button has an
  aria-label, everything works by keyboard; reduced motion: no flashes/smooth scroll.
- Scale: indexes for new lookups; no per-message queries; realtime payloads unchanged except the new columns.

## Non-goals
Read receipts, reactions, editing/deleting messages, replies to replies threading.
