# Stand Home (legacy look) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild "היציע שלי" as the legacy home (hero, match-day ticket, team chat, trips, tiles, fans' pitch) with real, live numbers.

**Architecture:** Counts come from a trigger-maintained `team_stats` table; "online now" and "in the room" come from Realtime Presence on dedicated private topics (`online:<club>`, `room:<fixture>`) so they never collide with the existing broadcast channels (`team:<club>`, `match:<fixture>`). One `OnlineProvider` in the app layout tracks the fan and exposes the team count via context. The page is a Server Component assembling small cached/cheap queries; live bits are small client components.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, RLS, Realtime Presence), Tailwind v4, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-12-stand-home-design.md`

## Global Constraints
- Hebrew copy; every number real or not shown ("—" before the first presence sync).
- Team accent from `bar` like legacy `teamColors()`: fills contrast ≥ 3.2, text ≥ 4.8 vs `#07090D`; on-accent `#fff` or `#0B0D12`.
- Card tiers: gold ≥ 4.2, silver ≥ 3.4, else bronze; no average → bronze with "–".
- Minute: ≤45 as is; 45–60 "מחצית"; then −15; cap "90+"; data status `HT` → "מחצית"; finished → "הסתיים".
- Ticket choice: live → just finished while room open (< kickoff+170′) → next → last finished.
- Staging first, then production (owner clicks). No test data in production.

## Review Focus
1. A fan with two tabs open counts once in "online now" → presence keyed by user id; test `countUsers`.
2. A fan of another club must not join `online:<club>` of mine → pgTAP policy test.
3. No upcoming match and none live (off-season) → ticket shows the last finished match, trips card says "אין משחק קרוב" → `pickTicket` tests.
4. A player without `pitch_x/pitch_y` in the XI must not break the pitch → placed on the bench; test `splitPitch`.
5. Team stats when a profile is deleted → counter goes down, never below 0 → pgTAP.

---

### Task 1: DB — team_stats counter + presence policies
**Files:** Create `apps/web/supabase/migrations/20261012050000_stand_home.sql`; Test `apps/web/supabase/tests/database/stand_home.test.sql`
**Produces:** `team_stats(team_id text pk fk teams, fans int ≥0)`; trigger on `profiles` after insert/delete; backfill from `profiles`; RLS select for authenticated where `team_id = my_team()`; grants select to authenticated, all to service_role. Realtime policies on `realtime.messages`: select + insert to authenticated when `extension = 'presence'` and (`topic = 'online:' || my_team()` or `topic like 'room:%'`).
- [ ] pgTAP (red): insert 2 mta + 1 hta profiles → `team_stats` mta = 2, hta = 1; delete one mta → 1; mta fan reads only mta row; policies exist with presence extension (query `pg_policies`).
- [ ] Migration (green) via `web-db.yml`.
- [ ] Apply to staging (verified), load production for the owner.

### Task 2: Pure helpers
**Files:** Create `apps/web/src/features/stand-home/schema.ts`, `schema.test.ts`
**Produces:** `teamAccent(bar: string): { accent: string; accent2: string; text: string; on: string; rgb: string }`; `minuteLabel(f: Fixture, nowMs: number): string`; `pickTicket(fixtures: Fixture[], clubApiIds: number[], nowMs: number): Fixture | null`; `cardTier(avg: number | null): 'gold' | 'silver' | 'bronze'`; `untilLabel(ms: number): string` ("5 דק׳" / "1:05 ש׳"); `countUsers(state: Record<string, { user_id?: string }[]>): number`; `splitPitch(players: PitchPlayer[]): { xi: PitchPlayer[]; bench: PitchPlayer[] }`.
- [ ] Tests (red) for each Review Focus item + the constraints' exact values; implement (green) via `web-ci.yml`.

### Task 3: Queries + presence plumbing
**Files:** Create `features/stand-home/server/queries.ts`, `features/stand-home/components/online-provider.tsx`; Modify `app/(app)/layout.tsx`, `features/ratings/server/queries.ts` + `schema.ts` (pitch_x/y), `features/match-room/components/match-room.tsx` (track `room:<id>`).
**Produces:** `getStandHome(teamId, userId)` → `{ fans: number | null, chat: ChatMessage[] (last 3, blocked hidden), events: number, market: number, squad: PlayerRow[] }` (parallel queries, head counts); `OnlineProvider` + `useOnlineCount(): number | null`; `useRoomCount(fixtureId): number | null` (listen only).

### Task 4: UI
**Files:** Create `features/stand-home/components/{hero,match-ticket,team-chat-card,trips-card,tiles,fan-pitch,rating-sheet}.tsx`; Modify `app/(app)/stand/page.tsx`, `app/globals.css` (component classes ported from legacy `.hero .stats .scarf .tk .tk-f .tchat .chip .ctile .pitch .pc .bench`).
- [ ] Page in legacy order; accent CSS vars from `teamAccent` on the page root; ticket ticks every 30 s and `router.refresh()` every 60 s while live/closing.
- [ ] CI green (typecheck, lint, unit, build, e2e).

### Task 5: Verify + ship
- [ ] Preview on staging: screenshot vs legacy; online count moves when a second tab opens; room count on the demo match.
- [ ] Production: migration by the owner; check the live home loads.
- [ ] Fresh reviewer on the branch range; fix pass; docs (ROADMAP, DATA_MODEL).
