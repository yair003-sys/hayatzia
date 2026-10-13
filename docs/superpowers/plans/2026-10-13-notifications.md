# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Goal / full-time pushes for all league matches (with per-fan settings), message pushes that respect settings, and an in-app top banner — on branch `notifications`.

**Architecture:** A `fixtures` trigger writes deduplicated `match_alerts` and broadcasts them on Realtime `alerts`; a secret-protected route drains unsent alerts into batched web push; a client banner in the app layout listens to `alerts` and `inbox:<me>`.

**Tech Stack:** Supabase (Postgres triggers, RLS, Realtime broadcast, pgTAP), Next.js 16 route handler + server actions, web-push, React 19, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-13-notifications-design.md`

## Global Constraints
- Branch `notifications` only; never push to `main`.
- No message text in any push, server log or broadcast.
- Defaults: matches 'all', messages true; no prefs row = defaults.
- One alert per (fixture, kind, score); trigger on UPDATE only; ignore fixtures kicked off > 4 h ago; alerts older than 30 min when claimed are marked sent without pushing.
- Hebrew copy exactly as in the spec ("⚽ שער! …", "סיום: …").
- Every `useEffect` body braced.

## Review Focus
1. A fan with matches 'off' never gets a match push; 'team' only for the two clubs (pgTAP on `alert_recipients`).
2. VAR correction 1:0 → 0:0 → 1:0 produces exactly one goal alert (pgTAP).
3. First ingest of an old season / backfill produces no alerts (pgTAP: kickoff 5 h ago).
4. Dispatch without the right secret → 401 and nothing sent (route unit test).
5. Banner never shows for the conversation or match currently open, nor when the relevant setting is off (unit tests on the pure rule).

---

### Task 1: Database
**Files:** Create `apps/web/supabase/migrations/20261013120000_notifications.sql`, `apps/web/supabase/tests/database/notifications.test.sql`; hand-update `apps/web/src/lib/supabase/database.types.ts`.
**Produces:** tables `notification_prefs(user_id pk default auth.uid(), matches text check in ('all','team','off') default 'all', messages bool default true, updated_at)` (own-row select/insert/update), `match_alerts(id bigserial, fixture_id, kind 'goal'|'ft', home_goals, away_goals, scoring_api_id int null, created_at, sent_at null, unique(fixture_id, kind, home_goals, away_goals))` (no client access); trigger `fixtures_alerts` AFTER UPDATE OF gh/ga/status (use the real column names in `fixtures`) with the spec rules, broadcasting `realtime.send({id, fixture_id, kind, home_goals, away_goals, scoring_api_id}, 'alert', 'alerts', true)`; realtime policy allowing authenticated to receive topic `alerts`; `alert_recipients(p_fixture bigint) returns setof uuid` (security definer, service_role only): users with prefs 'all' or no row, plus 'team' whose profile club is `club_of_api(home)` or `club_of_api(away)`; `message_push_allowed(uuid[]) returns setof uuid` (service_role) filtering messages=false; `claim_alerts(p_limit int) returns setof match_alerts` (service_role) marking `sent_at=now()` atomically (`for update skip locked`).
- [ ] pgTAP first (rules + Review Focus 1–3), push, red, implement, green via `web-db.yml`, commit.

### Task 2: Sending + settings
**Files:** Modify `apps/web/src/features/push/server/send.ts` (paged subscriptions 1000/page, concurrency 50), `push/server/actions.ts` + `dm/server/actions.ts` (filter with `message_push_allowed`), `lib/env.ts` (`ALERTS_SECRET` optional server var); Create `apps/web/src/app/api/alerts/dispatch/route.ts`, `apps/web/src/features/push/alerts.ts` (+ test: `alertText(alert, home, away, scorers, minute)` → {title, body, url, tag}), `apps/web/src/features/push/components/notification-settings.tsx` (+ server action `savePrefsAction`), use it on `app/(app)/me/page.tsx`.
**Produces:** `POST /api/alerts/dispatch` (Bearer `ALERTS_SECRET`; 401 otherwise; claims up to 50 alerts, stale >30 min skipped, scorers from `fixture_details` events after the previous alerted score, sends to `alert_recipients`), returns `{ sent, skipped }`.
- [ ] Unit tests first (`alertText`, 401 path with a mocked request), implement, CI green, commit.

### Task 3: In-app banner
**Files:** Create `apps/web/src/features/push/components/alert-banner.tsx`, `apps/web/src/features/push/banner.ts` (+ test: `shouldShow(event, { pathname, prefs, myClubApiIds })`); Modify `app/(app)/layout.tsx` (mount banner), `globals.css` (`.ab-*`).
**Consumes:** `alerts` topic payload, `inbox:<me>` events (`{thread_id|group_id, from}`), `useDeviceKey` from `features/dm/use-device-key.ts` to decrypt the message (select the message by thread's `last_message_id`), team colours.
- [ ] Tests first for `shouldShow` (open conversation, open match page, prefs off/team), implement, CI green, commit.

### Task 4: Wiring + demo
**Files:** Modify `.github/workflows/web-ingest.yml` (after ingest: `curl -fsS -X POST -H "Authorization: Bearer $ALERTS_SECRET" "$APP_URL/api/alerts/dispatch"` when both are set; never fail the job on it), `apps/web/scripts/demo-match.ts` (after each score change call dispatch on staging when `APP_URL`/`ALERTS_SECRET` are set), `.github/workflows/web-demo-match.yml` (pass them), `docs/ENVIRONMENTS.md` (new secret/variable), `docs/ROADMAP.md`.
- [ ] CI green; commit. Controller then prepares the owner's secret paste and staging check.
