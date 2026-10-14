# Activity Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** A bell with an unread badge on every in-app screen and an "התראות" list of likes on the fan's posts and trip join requests / acceptances; trip events also push + banner. Branch `notifications`.

**Spec:** `docs/superpowers/specs/2026-10-14-activity-bell-design.md`

## Global Constraints
- Branch `notifications` only; never push to `main`.
- Counters and aggregation by trigger; keyset pagination; an index for every query; no N+1 when rendering.
- RLS own rows only; no client writes to `activity`; security-definer functions with `search_path=''`, revoked from public/anon.
- No message text anywhere; ids-only broadcasts on `inbox:<me>` (event `activity`) via `listenPrivate`.
- Every useEffect body braced; no Date.now in render (use the clock helper); Server Components first; Suspense around runtime data.
- Hebrew copy exactly as in the spec.

## Review Focus
1. Like / unlike / re-like keeps `actor_count` exact and never notifies the owner about their own like (pgTAP).
2. Trip request → one row for the trip owner; accept → one row for the requester; decline → nothing for the requester (pgTAP).
3. Badge count = rows updated after `seen_at`; marking seen is own-row only (pgTAP).
4. List renders with a fixed number of queries regardless of length (no per-row lookups).
5. Trip pushes go only to the intended fan, with no extra text.

### Task 1: Database
New migration `apps/web/supabase/migrations/20261014090000_activity.sql` + pgTAP `apps/web/supabase/tests/database/activity.test.sql`; hand-edit `database.types.ts`.
Tables `activity` and `activity_seen` per spec; triggers on `clip_likes` (insert/delete), `team_photo_likes` (insert/delete), `trip_requests` (insert; update of status → accepted); `activity_unread_count()` and `mark_activity_seen()` (security definer, own user); 60-day prune on write; broadcast `activity` on `inbox:<recipient>`.
- [ ] pgTAP first (Review Focus 1–3), red, implement, green via web-db.yml, commit.

### Task 2: UI + push
Bell component in the `(app)` layout (badge from `activity_unread_count`, live via `listenPrivate` on `inbox:<me>` event `activity`); page `app/(app)/activity/page.tsx` (keyset list, one query joining nick / post thumbnail / trip summary, relative time, unseen rows highlighted, marks seen on open); links to the clip / photo / trip; trip pushes from the existing trip server actions via `sendPush` (respect nothing else); banner shows trip events (extend `shouldShow` / alert banner for `activity` trip kinds); unit tests for copy building and the badge rule.
- [ ] Tests first, implement, CI green (web-ci.yml), commit.
