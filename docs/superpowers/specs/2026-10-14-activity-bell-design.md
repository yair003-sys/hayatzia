# Activity bell (notification centre) — design

Status: approved by the owner, 2026-10-14 ("מאשר"). Built on branch `notifications`, shipped together with the goal alerts, merged only on his approval.

## Intent
Like Instagram / Facebook: a bell at the top of every in-app screen with a red count of what is new; tapping it opens a list of what happened to **the fan's own things**.

## Owner decisions
- In the list: likes on the fan's posts (Square clips and team-page photos), one row per post aggregated ("דני ועוד 12 אהבו את הסרטון שלך"); someone asked to join the fan's trip ("יוסי ביקש להצטרף לנסיעה שלך"); the fan's join request was accepted ("אושרת! הצטרפת לנסיעה של דני").
- Not in the list: goals, full time (they stay banner + push only), comments.
- Phone push + in-app banner: only the two trip events. Likes: bell only. (Claude proposed, owner: "כן".)
- Bell top corner of every in-app screen (left side in RTL), red badge; opening the list clears the badge.

## Claude's calls
- Trip pushes are always on (rare, actionable); no new setting.
- Rows kept 60 days; older rows are deleted by the existing scheduled job if one fits, otherwise pruned on write (cheap, indexed).
- An unliked post lowers the count; a post whose likes all go away disappears from the list; a deleted post/trip removes its rows (FK cascade).
- Own actions never notify (liking your own clip, your own trip).
- Blocks: a blocked fan's likes and requests never surface (respect the existing `blocks` table where the source data already respects it; the trip owner still sees requests as today).
- Badge = rows with `updated_at > last_seen_at` (one `activity_seen(user_id, seen_at)` row per fan); opening the list sets it.
- Data shape: one `activity` row per (recipient, kind, subject) — `kind in ('clip_like','photo_like','trip_request','trip_accepted')`, subject = clip / photo / trip id (+ requester for trip_request), `actor_id` = latest actor, `actor_count`, `updated_at`. Maintained by triggers on `clip_likes`, `team_photo_likes`, `trip_requests` (insert → trip_request for the owner; status → accepted → trip_accepted for the requester). Counts by trigger, never by counting at read time. Keyset pagination by (updated_at, id). RLS: own rows only; no client writes.
- Realtime: the triggers broadcast on the existing private `inbox:<me>` topic (event `activity`, ids only) so the badge updates live, using the shared channel helper.
- Push for trip events from the server action that creates / accepts the request (same pattern as DM pushes), no text beyond nick + "ביקש להצטרף לנסיעה שלך" / "אושרת! הצטרפת לנסיעה של <nick>".
- Hebrew copy (masculine default, as elsewhere in the app): "<nick> אהב את הסרטון שלך" / "<nick> ועוד N אהבו את הסרטון שלך"; same with "התמונה שלך"; "<nick> ביקש להצטרף לנסיעה שלך"; "אושרת! הצטרפת לנסיעה של <nick>". Relative time ("לפני 5 דק׳").
- Demo content stays labelled; no demo rows written to production.

## Non-goals
Comments, follows, mentions, goals/full time in the list, email, per-kind settings.

## Anti-goals
Message text anywhere in activity rows or broadcasts; N+1 lookups when rendering the list; a push per like.
