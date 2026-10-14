# Notifications: goals, full time, messages, in-app banner — design

Status: approved by the owner, 2026-10-13 ("תתחיל").

## Intent
The owner wants a fan to be told, at the top of the screen, when a private message arrives, when a goal is scored and when a match ends — for **every league match** — both as a phone notification (app closed) and as a small banner inside the app. Built on branch `notifications`, merged only on his approval.

## Owner decisions
- Goals and full time for **all league matches** by default. (owner)
- Settings in "הכרטיס שלי": matches = all league (default) / my club only / off; private messages & groups = on (default) / off. (Claude proposed, owner: "מתאים")
- Phone notifications for messages carry no message content (end-to-end encryption, unchanged). The in-app banner shows the text, decrypted on the device. (Claude, owner approved the description)

- Claude's calls after the builder check:
  - **No duplicates:** one alert per (fixture, kind, score) — unique key; a score corrected by VAR and reached again does not alert twice; alerts are never deleted when a score drops.
  - **Several goals between two updates:** one alert for the new score; the body lists the scorers since the last alerted score (from `fixture_details` events), else just the score.
  - **No flood:** the trigger runs on UPDATE only and ignores fixtures that kicked off more than 4 hours ago (backfills, new seasons, first ingest stay silent).
  - **Delay:** alerts arrive when the data does. Today the league data refreshes about every 10 minutes, so a goal push can come up to ~10 minutes late; near-live alerts need the paid live data with a fast poller (on the launch list). The design works unchanged with a faster poller.
  - **Where dispatch is called:** a GitHub environment variable `APP_URL` per environment — production `https://hayatzia-flame.vercel.app`, staging `https://hayatzia-git-demo-preview-hayaziha.vercel.app` (staging preview) — so staging alerts never hit production.
  - **Failed dispatch:** alerts older than 30 minutes when claimed are marked sent without pushing (stale); the in-app banner already showed them live.
  - "My club" = the fan's profile club (one per fan).

## Behaviour
### Phone notifications (web push, existing subscription)
- Goal: title "⚽ שער! <home> <h>:<a> <away>", body "<minute>′ · <scorer>" (scorer omitted if unknown), opens `/matches/<id>`. Tag per fixture so a later goal replaces the earlier one on the lock screen.
- Full time: title "סיום: <home> <h>:<a> <away>", opens `/matches/<id>`.
- Private message / group / invite: as today, only if messages are on.
- Recipients for match alerts: fans whose setting is "all", plus fans of the two clubs whose setting is "team". Off → nothing. No row → "all".
### In-app banner (any screen inside the app, signed in)
- Slides in at the top, auto-hides after 5 s, tap opens the target, swipe sideways dismisses. One at a time; newer replaces older.
- Messages: "<nick>: <text>" decrypted on the device (falls back to "הודעה חדשה מ־<nick>"); groups "<group> · <nick>: <text>". Not shown while that conversation is open, or when messages are off.
- Goals / full time: in the scoring club's colours; same text as the phone notification. Not shown while that match page is open; respects the match setting.
### Settings ("הכרטיס שלי" → הגדרות)
- "התראות משחקים": three-way choice. "הודעות פרטיות וקבוצות": on/off. Saved per fan; also governs the in-app banner.

## How it gets made (Claude's calls)
- **Data**: `notification_prefs(user_id pk, matches 'all'|'team'|'off' default 'all', messages bool default true)`, own-row RLS. `match_alerts(id, fixture_id, kind 'goal'|'ft', home_goals, away_goals, scoring_api_id null, created_at, sent_at null)` written by a trigger on `fixtures` when a score goes up (one alert per new goal side) or the status becomes FT/AET/PEN; the same trigger broadcasts on Realtime topic `alerts` (readable by any signed-in fan) for the in-app banner. Demo fixtures (`is_demo`) only alert on staging (they exist only there).
- **Sending**: route handler `POST /api/alerts/dispatch` protected by a shared secret `ALERTS_SECRET` (Vercel env + GitHub environments): claims unsent alerts (`sent_at`), adds the scorer and minute from `fixture_details`, resolves recipients in SQL (`alert_recipients(fixture)`), sends web push in batches (paged subscriptions, bounded concurrency), marks sent. Called by the ingest workflow after each ingest and by the staging demo-match script.
- `sendPush` gains paging + concurrency; DM/group/invite pushes skip fans with messages off.
- Banner: one client component in the `(app)` layout listening to `alerts` and `inbox:<me>`, using the existing device key hook to decrypt message previews.
- pgTAP for the trigger, prefs and recipients; unit tests for text building and banner suppression rules.

## Non-goals
Kick-off, red cards, line-ups, per-club picking beyond "my club", quiet hours, email.

## Anti-goals
Message text in any push or server log; a fan with "off" getting match pushes; duplicate pushes for one goal; alerts from production reaching staging or the reverse.

## Owner actions needed at the end
Paste one new secret value (`ALERTS_SECRET`) into Vercel and GitHub (Claude prepares the screens; the owner pastes); Run the production migration.
