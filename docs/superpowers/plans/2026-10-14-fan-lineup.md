# Fan Lineup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Fans build their XI by dragging on the existing pitch (full-screen overlay), and see the fans' most-wanted XI with percentages; after the match the pitch shows fans' ratings. Branch `fan-lineup`.

**Spec:** `docs/superpowers/specs/2026-10-14-fan-lineup-design.md`

## Global Constraints
- Branch `fan-lineup` only; never push to `main`.
- Locked at kick-off, server-enforced (RLS / function check), not only in the UI.
- Aggregates by trigger; indexes for every query; no N+1; aggregates expose counts only.
- Every useEffect body braced; no Date.now in render; Server Components first; Suspense around runtime data.
- Hebrew UI copy; RTL; phone-first drag that does not fight scrolling; keyboard alternative.

## Review Focus
1. Saving after kick-off is rejected by the database (pgTAP).
2. Re-saving replaces the fan's picks exactly (tallies never double count; changing formation moves counts) (pgTAP).
3. Only the fan's own club and only real players of that club; 11 distinct players (pgTAP).
4. Fans' XI computation is correct and has no duplicate player (unit tests on the pure function).
5. Drag works with touch and mouse, keyboard alternative exists (component tests).

### Task 1: Database
Migration `apps/web/supabase/migrations/20261014120000_fan_lineups.sql` + pgTAP `fan_lineups.test.sql`; hand-edit `database.types.ts`. Tables per spec, RLS, `save_fan_lineup(fixture, formation, slots)` security-definer with all validation, tally triggers, read function/view for the aggregate.
- [ ] pgTAP first (Focus 1–3), implement, green via web-db.yml, commit.

### Task 2: UI
Pure module (formations → slot coordinates, fans' XI from tallies, validation) with tests; full-screen overlay builder (pitch + squad strip, drag/swap/remove, formation picker, save via server action); toggle "ההרכב שלי / ההרכב של האוהדים" on the existing pitch in the match page's "הרכב" tab with percentages; post-match: average rating per player on the pitch from existing ratings; CTA on the home "משחקים חיים"/next-match card "בנה את ההרכב שלך".
- [ ] Tests first, implement, CI green (web-ci.yml), commit.
