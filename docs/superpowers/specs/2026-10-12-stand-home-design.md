# Stand home ("היציע שלי") like the legacy home: design (stage 1 of 4)

Status: draft for owner approval, 2026-10-12.

## Intent
The owner finds the new home page a dull list of rows ("העמודות האלה… לא טוב לי") and wants it "כמו הישן": the legacy home tab of `index.html` (GitHub Pages app), and he wants it **alive** ("אני צריך את הדף הראשי פעיל"). The legacy page is the mockup: same sections, same order, same look. Counts that legacy faked must be real here.

Owner decisions (2026-10-12):
- Home looks and behaves like the legacy home.
- The prediction card ("ניחוש למשחק הבא") moves to the Matches tab (stage 3), not the home.
- "תמונות מהיציע" moves into the Square (stage 2), not the home.
- Order of work: 1 home with what exists · 2 photos to the Square · 3 predictions in Matches · 4 bring back player of the match, "הייתי שם", stand songs.

## Goals (stage 1)
Rebuild `apps/web/src/app/(app)/stand/page.tsx` as the legacy home, sections in this order:
1. **Hero card**: scarf + "היציע של" + team name (36px Rubik 800), two glass stat boxes: **verified fans** (real count) and **online now** (real, live), lock line "סגור לאוהדי {short} בלבד". Legacy CSS `.hero/.stats/.lockline/.scarf` (index.html L105–107, L173–180) is the reference.
2. **"יום משחק" ticket** for the fan's club: the live match if one is live, otherwise the next match (or the most recent finished one if none is upcoming). Header with live dot + minute ("מחצית" at HT) or kick-off day/time or "הסתיים"; "הקבוצה שלך" pill; two rows (scarf, name, score); footer strip by room state: open → accent gradient bar with sheen "הצ'אט פתוח" + "{n} אוהדים" (real: fans present in the match room right now) + arrow; closing → red "הצ'אט נסגר בעוד …"; soon → "הצ'אט ייפתח בעוד …"; closed → "הצ'אט נסגר · אפשר לקרוא". Whole card opens `/matches/{id}`. Live card gets the red glow. Legacy `.tk*` CSS (L129–160) is the reference; do not copy the legacy `.lv` padding leak.
3. **"הצ'אט של הקבוצה"** section header + card: chat icon, "צ'אט {short}", chip "פתוח תמיד" (accent-soft, not green), arrow, and the **last 3 messages** as one-line previews "nick: text" (blocked fans hidden). Opens `/stand/chat`.
4. **"נוסעים למשחק"** card: chip "{n} נסיעות" for the next match, line "המשחק הבא: בבית/בחוץ מול {short} · {day} {time}", line "מוצאים פרטנרים לנסיעה, ומתאמים בשיחה פרטית". Opens `/stand/trips`. No upcoming match → "אין משחק קרוב".
5. **Tiles row** (3 equal tiles): 📅 אירועים "{n} קרובים" → `/stand/events`; 🧣 שוק אוהדים "{n} מודעות" (unsold) → `/stand/market`; third tile 🖼️ תמונות מהיציע → `/stand/photos` **until stage 2** moves photos to the Square, then it becomes 🎶 שירי היציע in stage 4.
6. **"ההרכב של האוהדים"**: green striped pitch with lines and tag "4-3-3 · לדוגמה" (the XI is sample data and stays labelled), FUT-style cards (bronze/silver/gold by average: gold ≥ 4.2, silver ≥ 3.4) placed by `players.pitch_x/pitch_y`, showing average ("–" when none), position, shirt, short name, 5-star row, my rating badge, injury mark; "ספסל" strip scrolling sideways with the rest of the squad + coach. Tapping a player opens a rating sheet (stars 1–5 + optional short review) that reuses `ratePlayerAction`. Note under it as legacy ("הדירוג הוא ממוצע אמיתי של אוהדי {short}… ההרכב הוא דוגמה"). The full list page `/stand/players` stays.

Also:
- **Team accent**: on the stand page the accent follows the fan's club like legacy `teamColors()` (index.html L3133–3139: start from `bar`, lighten until contrast ≥ 3.2 for fills and ≥ 4.8 for text against `#07090D`; text-on-accent white or `#0B0D12`). Maccabi/Beitar → yellow bar, as the owner saw.
- "Alive": online count and room count update live; the ticket's minute/score refresh without reload while a match is live; new team-chat messages update the preview.

## Non-goals (stage 1)
Predictions, photos strip, "הייתי שם", player of the match, stand songs (later stages). No change to other tabs.

## Anti-goals
- Fake numbers. Legacy invented members/online counts; here every number is real or the element is not shown.
- A heavier page: the home must stay fast (cached league data, a handful of small queries, no N+1).
- Unlabelled sample content (the XI positions are a sample: label stays).

## How it gets made (Claude's calls)
- **Verified fans**: counter by trigger, per the standing rule: table `team_stats(team_id pk, fans int)` maintained on `profiles` insert/delete; readable by authenticated fans of that team. Backfilled in the migration.
- **Online now**: Supabase Realtime **Presence** on the existing private channel `team:<club>`; each open app tab of a signed-in fan tracks `{user_id}` (counted once per user). Needs RLS on `realtime.messages` for `extension = 'presence'` (select + insert) limited to the fan's own team topic, mirroring the broadcast policy. Count = distinct user ids in presence state. Shown as "—" until the first sync.
- **Room count**: Presence on `match:<id>`: the match page tracks; the home ticket only listens. Policy for `match:%` presence open to any authenticated fan (the room is readable by all).
- Pitch data: add `pitch_x, pitch_y` to the squad query; one query for squad + ratings (exists), no per-player queries.
- Live ticket: league data is cached minutes-scale; while the fan's match is live, the ticket refreshes via `router.refresh()` every 60 s (cheap: cached) — later the 5-second poller will make this sharper.
- New pieces live in `features/stand-home/` (components + server queries); legacy look ported as Tailwind + a few component classes in `globals.css` (`.hero`, `.tk`, `.pitch`, `.pc` equivalents).
- pgTAP tests for `team_stats` (counter moves, RLS) and presence policies; unit tests for pure helpers (minute label, team accent colours, card tier, room strip state text).

## Calls settled after the builder check (Claude's calls)
- **Which match the ticket shows**: the live match; else a just-finished match **while its room is still open** (until 170′ after kick-off, so "closing" shows); else the next match; else the last finished one ("closed").
- **"{n} אוהדים" on the ticket** = everyone present in that match room right now (both clubs and neutral readers), worded "{n} אוהדים בחדר".
- **Minute while live**: estimated from the real kick-off time and the clock, like legacy `st()` (≤45′ as is, 45–60 "מחצית", then −15, capped "90+"), and replaced by the data's minute/status whenever it is newer (HT/2H from data win). Score only from data. The ticket ticks every 30 s on the client; data refresh stays minutes-scale until the 5-second poller exists.

## Left to the builder
Exact Tailwind breakdown, component split, sheet animation, empty states copy (Hebrew, short).
