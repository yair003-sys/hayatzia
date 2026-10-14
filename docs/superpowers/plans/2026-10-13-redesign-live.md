# Redesign "live centre" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Floating tab bar, live match cards on home, a day strip on Matches and a tabbed match page with a line-up pitch — on branch `redesign` only.

**Architecture:** Pure helpers (tested) turn the cached league data into day buckets, live lists and pitch coordinates; small server/client components render them with `.lc-*` classes. No database changes.

**Tech Stack:** Next.js 16 App Router (Server Components, typed routes, `searchParams` promises), React 19, Tailwind v4 + globals.css component classes, Vitest, Playwright smoke. CI on the branch is the build machine.

**Spec:** `docs/superpowers/specs/2026-10-13-redesign-live-design.md`

## Global Constraints
- Work only on branch `redesign`; never push to `main`.
- No invented numbers; demo fixtures keep "משחק לדוגמה".
- No club crests: colour discs with initials (team `bg`/`ring` from `features/teams/data` or `displayTeam`).
- Hebrew RTL; clean type (`t-page`, `t-sec`, `t-num`, Heebo/Inter), brand tokens only; no emojis in headings.
- Every `useEffect` has a braced body (newer Chrome returns Promises from DOM methods).
- Keep existing behaviour of the match room, check-in, player of the match, crowd verdict, predictions and the table.

## Review Focus
1. A day with no games and a league with no data (`getLeague()` null) render calm empty states, not errors.
2. Israel midnight: a 23:30 kick-off belongs to that Israel date, not the UTC date (test in Task 1).
3. Line-ups missing or with null grid entries: the pitch falls back to a list, never crashes (test in Task 1).
4. Stale "live" statuses after full time are not shown as live (reuse the 170′ rule; test in Task 1).
5. The floating bar never covers page content or the composer of chats (bottom padding / sticky offsets).

---

### Task 1: Live helpers
**Files:** Create `apps/web/src/features/matches/live.ts`, `apps/web/src/features/matches/live.test.ts`
**Produces:**
- `israelDayKey(unixSeconds: number): string` → `YYYY-MM-DD` in Asia/Jerusalem
- `dayStrip(todayKey: string, fixtures: Fixture[]): { key: string; weekday: string; day: number; hasGames: boolean; today: boolean }[]` — 7 days, today in the middle (3 before, 3 after); weekday Hebrew short ("א׳"…"ש׳")
- `fixturesOn(dayKey: string, fixtures: Fixture[]): Fixture[]` sorted by kick-off
- `liveNow(fixtures: Fixture[], nowMs: number): Fixture[]` — same rule as `isTicketLive` in `features/stand-home/schema.ts` (import it, do not copy)
- `pitchSpots(xi: { n: number | null; p: string; pos: string; g: string | null }[]): { n: number | null; name: string; x: number; y: number }[] | null` — API grid "row:col" (row 1 = goalkeeper) → x/y percent on a vertical half-pitch (goalkeeper bottom); `null` if any grid is missing
- `initials(name: string): string` — up to 2 Hebrew/Latin initials, stripping ״ ׳ "
- [ ] Tests first (israelDayKey at 21:30Z = next Israel day; strip has 7 items with today in index 3; liveNow excludes a '2H' fixture started 200 min ago; pitchSpots null when a grid is null, GK lowest y, columns spread left→right; initials('מכבי ת״א')==='מת'). Push, see red in CI, implement, green, commit.

### Task 2: Visual kit + floating tab bar
**Files:** Create `features/matches/components/{crest.tsx,live-card.tsx,match-tile.tsx}`; Modify `components/tab-bar.tsx`, `app/(app)/layout.tsx` (bottom padding), `app/globals.css` (`.lc-*`, tab pill)
**Consumes:** Task 1 `initials`, `displayTeam`, `minuteLabel` from stand-home schema.
**Produces:** `Crest({ team, size })`, `LiveCard({ fixture, home, away })` (link to `/matches/<id>?tab=room`), `MatchTile({ fixture, home, away })` (compact; live variant coloured).
- [ ] Build; check chat composers (`sticky bottom-24`) and the Square still clear the bar; CI green; commit.

### Task 3: Matches page and home section
**Files:** Modify `app/(app)/matches/page.tsx`, `app/(app)/stand/page.tsx`; Create `features/matches/components/day-strip.tsx`
**Consumes:** Tasks 1–2.
- [ ] Matches: title "מרכז הליגה", `DayStrip` (links `?d=`), tiles for the selected day, predictions card and table below; empty day text "אין משחקים ביום הזה". Home: "משחקים חיים" section after the hero with `LiveCard`s, hidden when none. CI green; commit.

### Task 4: Match page with tabs and pitch
**Files:** Modify `app/(app)/matches/[id]/page.tsx`; Create `features/matches/components/{match-tabs.tsx,lineup-pitch.tsx,match-events.tsx}`
**Consumes:** Tasks 1–2, `getFixtureDetail`, existing `MatchExtras`, `MatchRoomSection`.
- [ ] Hero card; tabs משחק/הרכב/חדר via `?tab=` (default חדר while the room is open); events timeline (goal, card, subst with minute and player, Hebrew labels); pitch for each team with a team switch, subs list, fallback text. CI green; commit.

### Task 5: Ship to preview
- [ ] Final review of the branch, fix wave, CI green, send the owner the branch preview link. No merge.
