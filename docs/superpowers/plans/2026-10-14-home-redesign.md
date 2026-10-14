# Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Rebuild the top of the home screen per the approved sketch: header with bell, stories row, activity tiles, next match, players with rotating most-liked reviews, hot in the Square, team chat preview, mini table, fans of the week. Branch `home-redesign`.

**Spec:** `docs/superpowers/specs/2026-10-14-home-redesign-design.md`

## Global Constraints
- Branch `home-redesign` only; never push to `main`.
- Each section is its own Server Component inside its own `<Suspense>`; one batched query per section; indexes for every query; counters by trigger; cache public aggregates (`'use cache'` + `cacheLife`/`cacheTag`).
- Every useEffect body braced; no Date.now in render; RTL; reduced motion; 44px targets; Hebrew copy.
- Empty data → the section hides; demo content labelled.

## Review Focus
1. Review likes: like/unlike exact counts, one like per fan, own-review likes allowed or not (decide: not allowed), RLS (pgTAP).
2. No N+1 and each section streams independently.
3. Stories seen-state correct per fan; club scoping (a fan only sees his club's stories/chat).
4. Rotation pauses off-screen and with reduced motion.

### Task 1: Database
Migration `20261014150000_home.sql` + pgTAP: `player_rating_likes` + `likes_count` trigger; story seen-state (reuse `clip_views` if it is per fan, else `story_views`); SQL functions for "active fans (7d)", "fans of the week" (security definer where needed, club-scoped, cached in app), indexes. Hand-edit types.
- [ ] pgTAP first, implement, green (web-db.yml), commit.

### Task 2: UI
Header with bell; stories row + full-screen viewer reusing the Square player; tiles; next-match card (reuse fan-lineup CTA); players rotating-review carousel with ♥; hot clips; chat preview; mini table; fans of the week; ♥ on reviews where reviews are listed. Tests for pure helpers (rotation order, story ordering, table window).
- [ ] Tests first, implement, CI green, commit.
