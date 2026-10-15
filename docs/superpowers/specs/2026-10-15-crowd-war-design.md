# מלחמת הקהלים (crowd war): design

Status: approved by the owner 2026-10-15 ("1 נשמע טוב"). Engineering calls below are Claude's, stated to the owner.

## Intent
onefan's difference from club apps is that the whole league is here. Before every match of a club (not only derbies),
the two clubs' fan bases compete: fan activity in the 48 hours before kickoff adds points to the fan's own club. At
kickoff the war freezes and the winning crowd gets a shield ("הקהל של מכבי ניצח את הקהל של בית״ר 64–36"). Two
games every weekend: on the pitch and in the app. Goal: rivalry and daily engagement before matches.

## Rules (Claude's calls)
- Window: from 48 h before kickoff until kickoff. Nothing counts before or after; at kickoff the result is final.
- A fan counts only for a fixture where their club plays (home or away).
- Points per fan per fixture:
  - a message in the club's team chat or in the match room: 1 point each, at most 20 per fan;
  - a Square post (clip): 5 points each, at most 3 posts (15);
  - a prediction for that fixture (created or changed in the window): 5, once;
  - a fan lineup for that fixture (created or changed in the window): 5, once.
  - So at most 45 points per fan: many fans beat a few spammers.
- Team chat messages and Square posts belong to the club's next fixture inside the window (the earliest one).
- Demo fixtures (is_demo, staging) count like any other and stay labelled "לדוגמה" in the UI.

## Data (Claude's calls)
- `crowd_war_fans(fixture_id, user_id, team_id, chat, posts, predicted, lineup, points)` maintained only by
  AFTER INSERT/UPDATE triggers on team_messages, match_messages, clips, predictions, fan_lineups (security definer,
  `search_path = ''`). Fans read only their own row (for "תרמת N נקודות").
- `crowd_war_totals(fixture_id, team_id, points, fans)` maintained by trigger on crowd_war_fans (counters by trigger,
  no counting queries at read time). Readable by every signed-in fan (aggregates only).
- Indexes for every lookup: club → its next fixture in the window uses the existing fixtures (home/away, kickoff)
  indexes; totals by (fixture_id) and by (team_id, fixture_id) for the season record.
- A fan's season record (wins / losses of their crowd) from totals joined to fixtures of the current season.
- Rate: no extra writes beyond one upsert per action; the per-fan caps stop farming.

## UI (Claude's calls; Hebrew, RTL, both clubs' colours)
- Home next-match card ("hm-next"): a tug-of-war bar in the two clubs' colours with percentages, total points,
  "מסתיים בשריקת הפתיחה", and "תרמת N נקודות". Before the window opens: "מלחמת הקהלים נפתחת 48 שעות לפני המשחק".
  A short line on how to earn points ("הודעה 1 · פוסט 5 · ניחוש 5 · הרכב 5").
- Match page: the same bar at the top while open; after kickoff the frozen result with a shield for the winner
  ("הקהל של X ניצח 64–36"), or "תיקו בין הקהלים" on equal points; nothing when neither side has points.
- Fan card ("הכרטיס שלי"): "מלחמות קהלים העונה: 5 ניצחונות · 2 הפסדים".
- Reduced motion: no bar animation. Numbers with tabular digits.

## Non-goals (later, owner said "בהמשך")
Honour bets, head-to-head history page, weekly challenges, "הם אמרו", live push updates of the bar.

## Anti-goals
Counting that a few accounts can game; reading counts with heavy queries on every page load; showing a war for a
fixture where the fan's club does not play.
