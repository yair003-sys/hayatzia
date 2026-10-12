# Predictions ("ניחושים") in the Matches tab: design (stage 3 of 4)

Status: draft for owner approval, 2026-10-12.

## Intent
Bring back the legacy "ניחוש למשחק הבא" (index.html L2547–2552, L2626–2650, L2863–2875), moved from the home to the Matches tab (owner). Legacy stored guesses in localStorage and faked the leaderboard; here everything is real and server-checked.

## Owner decisions
- Lives in the Matches tab, not the home.
- Fans predict **every match of the round** (owner: "כל המחזור").
- Legacy rules kept: score guess per match, locks at kick-off, 3 points exact score, 1 point right direction (home win / draw / away win), a season leaderboard of your club's fans.
- **No first-scorer bonus for now** (owner chose option 1, 2026-10-12): our Hebrew squad (current) cannot be matched reliably to the provider's 2024 data (shirt numbers point at the wrong player). Add it once the paid API gives player ids and current squads.

## Behaviour
- **Entry card** at the top of `/matches`: "🔮 ניחושים", chip "פתוח" (open matches left to guess) or "ניחשת" (all guessed), line with my season points and rank in my club ("12 נק׳ · מקום 4 באוהדי מכבי ת״א"). Opens `/matches/predict`.
- **`/matches/predict`**: the current round (same round the Matches tab opens, `currentRoundIndex`), every fixture as a row: two team names, −/+ steppers for each side (0–20), save button per match ("שמירת הניחוש" / "עדכון הניחוש"); After kick-off the row is locked ("הניחושים נסגרו") and shows my guess; after full time it shows the real score and my points (+3 / +1 / 0).
- **Leaderboard** below: my club's fans by season points (top 20 + my own row if lower), ties by number of exact scores, then earlier joiner.
- Demo / sample data labelled as everywhere (staging demo round "משחק לדוגמה").

## How it gets made (Claude's calls)
- **Tables** (new migration, RLS, explicit grants, pgTAP):
  - `predictions(user_id, fixture_id, team_id stamped, home_goals 0–20, away_goals 0–20, points smallint null, exact boolean null, created_at, updated_at, pk (user_id, fixture_id))`, index `(fixture_id)`. Fans insert/update their own row only before kick-off (trigger raises `locked`); points columns are never writable by fans.
  - `prediction_totals(team_id, season, user_id, points, exact, played, pk (team_id, season, user_id))`, index `(team_id, season, points desc, exact desc)`: kept by trigger from `predictions` point changes (delta), readable by fans of that club. Season = the season of the fixtures in play.
- **Scoring** in the database, idempotent: `score_fixture(fixture_id)` sets `points/exact` for every prediction of a finished fixture (`FT/AET/PEN`, full-time score as stored). Called by a trigger on `fixtures` when status or score changes, so the existing ingest (and later the 5-second poller) scores automatically; a corrected score re-scores.
- **App**: `features/predictions/` (schema with pure scoring helpers mirrored for display, queries, actions, components). Matches page reads my totals and open count with two small queries.
- **Staging demo**: `scripts/demo-predictions.ts` + dispatch workflow (staging only): a labelled demo round with two upcoming matches (one of them the demo club's), one finished match with a score, demo fans' guesses so the leaderboard has rows. Owner tests by guessing the upcoming ones.

## Non-goals
Prizes, predictions for other clubs' scorers, cross-club leaderboard, notifications.

## Anti-goals
A guess changed after kick-off; points that a fan can set; a leaderboard that leaks other clubs' fans.
