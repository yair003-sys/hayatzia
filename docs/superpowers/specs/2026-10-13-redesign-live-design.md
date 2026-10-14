# Redesign "live centre" (Dribbble-inspired): design

Status: approved by the owner, 2026-10-13 ("ניראה טוב" on the prototype, artifact `onefan מרכז משחקים`).

## Intent
The owner sent a Dribbble sports-app shot and liked the prototype built from it: big live match cards in the clubs' colours, a day strip on the Matches screen, a match page with tabs and a line-up pitch, a floating pill tab bar. He wants it built **without risking the current app**: work on branch `redesign`, the current version is saved as branch `saved-before-redesign`, nothing reaches `main` until he says "מאשר".

## Owner decisions
- Build it on a separate branch with its own preview link; merge only on his approval; old version kept. (owner)
- No fake numbers: the "312 fans in the room" line and the stats tab are out until real data exists. (Claude, told to the owner)
- Club crests are not used (rights): clubs are drawn as colour discs with initials, as in the prototype. (Claude, standing rule)

## Behaviour
1. **Floating tab bar** (all signed-in screens): a rounded pill floating above the bottom with the five tabs as icons; the active tab sits in a blue circle; labels as `aria-label`. On the Square the pill stays dark over the reels.
2. **Home (`/stand`)**: under the hero, a section "משחקים חיים" with a large card per league match live right now (both clubs' colours blended, LIVE pulse, minute, big score, crest discs, "כניסה לחדר המשחק ←"). Hidden when nothing is live. The existing match-day ticket and the rest stay.
3. **Matches (`/matches`)**: title "מרכז הליגה"; a 7-day strip (right to left) centred on today, today highlighted, a green dot on days with games; tapping a day lists that day's games (`?d=YYYY-MM-DD`): live games as compact coloured cards with score and minute, others as rows with kick-off time or final score. If the selected week has no games, the strip jumps to the current round's days. Predictions card and the league table stay below.
4. **Match page (`/matches/[id]`)**: hero card in both clubs' colours (crest discs, score, LIVE/minute or kick-off), then pill tabs: **משחק** (events timeline: goals, cards, substitutions, with minute), **הרכב** (pitch with the starting XI from the provider's line-up grid, both teams switchable, subs listed; "ההרכבים יפורסמו לפני המשחק" if none), **חדר** (the existing room: check-in, player of the match, crowd verdict, chat). Default tab: **חדר** while the room is open, otherwise **משחק**. Tab in `?tab=`.
5. Demo fixtures keep their "משחק לדוגמה" label.

## How it gets made (Claude's calls)
- Pure helpers with unit tests in `features/matches/live.ts`: Israel-date day keys, the 7-day strip, live-now selection (reuse the stand-home live rule), line-up grid → pitch coordinates, crest initials.
- Components in `features/matches/components/`: `crest.tsx`, `live-card.tsx`, `match-tile.tsx`, `day-strip.tsx`, `match-tabs.tsx`, `lineup-pitch.tsx`; tab bar restyle in `components/tab-bar.tsx`. Styles as `.lc-*` component classes in `globals.css`, brand tokens only.
- No new database work; data from `getLeague()` / `getFixtureDetail()` (cached). Everything indexed already.

## Non-goals
Stats tab, fan counts per room, other leagues/sports chips, real crests.

## Anti-goals
Any change visible on `main`/production before the owner approves; invented numbers; breaking the match room, check-in, ratings or predictions.
