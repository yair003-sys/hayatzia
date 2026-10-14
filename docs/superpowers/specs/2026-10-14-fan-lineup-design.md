# Fan lineup ("ההרכב של האוהדים") — design

Status: approved by the owner, 2026-10-14 ("מצויין"). Branch `fan-lineup` (from main c7af6a9, which has the redesign), merged only on his approval.

## Intent
A pre-match ritual that brings fans back between matches: every fan builds the XI they want on the FIFA-style pitch that already exists in the match page's "הרכב" tab, and everyone sees the fans' most-wanted XI. After the match the same pitch carries the fans' player ratings. The owner wants it to grow into "reviews + lineup".

## Owner decisions
- Built on the existing FIFA-style pitch (match page, tab "הרכב").
- Drag players on the pitch; a button opens the pitch full screen on top of the current screen.
- (Claude proposed, owner "מצויין"): full screen = pitch on top, the club's squad strip below to drag from; drag onto a player swaps; drag off returns to the bench; formation picker (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2); "שמור את ההרכב שלי"; then a toggle "ההרכב שלי / ההרכב של האוהדים" showing per slot the most-picked player with a percentage ("87%"); open until kick-off; after the match the pitch shows the fans' ratings.

## Claude's calls
- Scope: the fan builds the lineup of **his own club** only, for that club's upcoming fixture (kick-off in the future, not started). Locked at kick-off (server-enforced).
- Squad source: the club's players already in the database (`players` for the club); injured players shown greyed but allowed.
- Data: `fan_lineups(user_id, fixture_id, team_id, formation, slots jsonb [{slot, player_id}] ×11, updated_at)` pk (fixture_id, user_id), own-row RLS, validated server-side (11 distinct players of that club, valid formation/slots). Aggregation by trigger into `fan_lineup_tallies(fixture_id, team_id, formation_slot_role, player_id, picks)` + `fan_lineup_totals(fixture_id, team_id, fans, formation counts)`; the fans' XI = for the most-picked formation, per slot role the top player (no duplicates: greedy by picks). Readable by any signed-in fan of the league; counts only, no user ids.
- Percentages = picks / fans who saved a lineup for that fixture and club.
- After the match: reuse the existing player ratings (no new rating system) and show each player's average on the pitch; reviews keep using the existing review field.
- Touch: pointer events with a long-press-free drag (works on phones), keyboard alternative (select slot → select player), reduced motion respected, RTL.
- Full screen is an in-app overlay (not the browser Fullscreen API), closes with back/escape, keeps scroll position.
- Demo content on staging stays labelled.

## Non-goals
Rival club lineups, captain/sub picks, tactics arrows, sharing images (later), coach "listened" score (later idea).

## Anti-goals
A lineup saved after kick-off; counting a fan twice; per-fan data exposed in the aggregate; a drag interaction that fights page scrolling on phones.
