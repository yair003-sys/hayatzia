# Home ("היציע") redesign — design

Status: approved by the owner, 2026-10-14 ("נדיר"), from the sketch artifact "onefan — דף ראשי עם סטוריז". Branch `home-redesign` (from main 7f66584), merged only on his approval.

## Intent
The first screen a fan sees should feel alive and full every day, Instagram-like, so fans come back between matches.

## Owner decisions (from the sketch, top to bottom)
1. Top row: onefan logo, "האוהדים של <club>" in the middle (club colour), the activity bell with its badge.
2. Stories row (Instagram style), horizontally scrolling circles: "הסטורי שלך" (+, opens the Square upload), app circles in club colours — "שאלת היום", "ההרכב שלך" (before a match; "דרג את השחקנים" after one) — then fans' stories = the club's fans' latest Square clips (24 h), unseen = coloured ring, seen = grey; tap opens full screen and swipes clip to clip.
3. Two tiles: "אוהדים פעילים" and "מחוברים עכשיו" (green dot).
4. Next-match card with countdown and "בנה את ההרכב שלך" (existing fan-lineup CTA).
5. "השחקנים בעיני האוהדים": horizontal cards (number, name, position, stars, average, count) where the review line rotates every ~4 s with a fade between the most-liked reviews, showing nick and ♥ count. Requires likes on player reviews (new).
6. "🔥 החם בכיכר היום": 3–4 most-liked Square clips of today, reel-style cards.
7. "עכשיו בצ׳אט של האוהדים": last 3 team-chat messages, "N כותבים", "הצטרף לשיחה".
8. Mini table: the club's row highlighted with the team above and below.
9. "🏆 אוהדי השבוע": top 3 fans with medals and points.

## Claude's calls
- Data reuse: stories = existing `clips` (club audience, 24 h expiry); "active fans" = club fans with activity in the last 7 days (counter by query on indexed columns, cached ~1 min); "online now" = Realtime presence already used by the stand / match rooms if available, else fans seen in the last 5 minutes; chat = `team_messages`; table = `standings`; fans of the week = points from predictions + ratings + Square likes over 7 days (one SQL function, cached).
- Story "seen" state per fan: a small `story_views(user_id, clip_id)` table or reuse `clip_views` if it already records per-fan views (prefer reuse).
- Review likes: `player_rating_likes(player_id, author_id, user_id)` with `likes_count` on `player_ratings` maintained by trigger; rotation shows the top 5 by likes from the last 30 days per player; a ♥ button wherever reviews are shown.
- "שאלת היום": out of scope for this branch unless a daily question already exists; the circle appears only when there is one (placeholder hidden otherwise). (Kept as a later feature.)
- Every section hides itself cleanly when it has no data; demo content stays labelled; no N+1 (one batched loader per section, Suspense per section so the page streams); reduced motion stops the rotation; rotation pauses when off-screen.
- Existing home sections not in the sketch stay below, unchanged, until the owner decides.

## Non-goals
Posting stories outside the Square, daily-question authoring, comments on reviews.

## Anti-goals
A slow home (each section streams independently); invented numbers; exposing other fans' private data (only nicks and public counts).
