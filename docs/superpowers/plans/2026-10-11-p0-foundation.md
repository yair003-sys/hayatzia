# P0 Foundation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js 16 skeleton in `apps/web` that builds green in CI, renders the Hebrew RTL shell with the five tab routes, and carries the design tokens of the legacy app.

**Architecture:** Feature-first App Router app (see `docs/ARCHITECTURE.md`). Static shells only in P0; no backend yet.

**Tech Stack:** Next.js 16.4 (Cache Components, Partial Prefetching), React 19, TypeScript strict, Tailwind CSS v4, Vitest, Playwright, ESLint flat config + Prettier.

**Spec:** `docs/superpowers/specs/2026-10-11-nextjs-platform-design.md`

## Global Constraints
- The sandbox has no npm access: dependencies are resolved and the lockfile committed by CI (`web-ci.yml`, bootstrap job). Every verification step = a green CI run.
- `<html lang="he" dir="rtl">`, logical CSS properties only.
- No `process.env` outside `src/lib/env.ts`.
- Legacy site must keep deploying unchanged; web changes must not trigger the legacy deploy.

## Review Focus
1. Hebrew text renders RTL with the right fonts on a 390px-wide phone: the Playwright smoke test checks `dir="rtl"` and the Hebrew heading.
2. A missing or invalid env var fails the build loudly: unit test on the env schema.
3. Navigating tabs keeps the URL (refresh returns to the same tab): e2e smoke visits `/square` directly.
4. Non-production builds show the "סביבת בדיקות" banner and production never does: unit test on `EnvBanner` logic.
5. Team data stays identical to the legacy app (14 clubs, colours): unit test on `TEAMS`.

---

### Task 1: Tooling and CI bootstrap
**Files:** `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc.json`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `.env.example`, `scripts/bootstrap-deps.sh`, `.github/workflows/web-ci.yml`; modify `.github/workflows/update.yml` (ignore web paths).
- [ ] Bootstrap job: when `apps/web/package-lock.json` is missing, install the dependency list with `--save-exact`, then commit `package.json` + lockfile back to `main`.
- [ ] Verify job: `npm ci` → `typecheck` → `lint` → `test` → `build` → Playwright smoke.
- [ ] Push; expected: bootstrap commits the lockfile, then verify passes.

### Task 2: Design system and root layout
**Files:** `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/utils.ts`, `src/lib/env.ts`, `src/components/env-banner.tsx` (+ tests).
- [ ] Tokens from the legacy `:root` (bg, surfaces, fg, muted, dim, lines, accent, live, ok, radii, easing) as Tailwind v4 `@theme` variables.
- [ ] Heebo (body) + Rubik (display) via `next/font/google`, subsets `hebrew` + `latin`.
- [ ] `env.ts`: `NEXT_PUBLIC_APP_ENV` ∈ `local|preview|production` (default `local`).

### Task 3: Teams domain
**Files:** `src/features/teams/data.ts`, `src/features/teams/components/team-scarf.tsx`, `src/features/teams/data.test.ts`.
- [ ] `TEAMS: readonly Team[]` (14 clubs, exact ids, names, colours from legacy) and `teamById(id)`.

### Task 4: App shell and routes
**Files:** `src/app/(public)/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/{stand,matches,square,inbox,me}/page.tsx`, `src/components/tab-bar.tsx`, `src/app/not-found.tsx`, `tests/smoke.spec.ts`.
- [ ] Welcome page (static), tab bar with five links (active state from `usePathname`), placeholder screens with skeletons.
- [ ] Smoke e2e: `/` has `dir=rtl` and the Hebrew heading; `/square` loads directly with the tab marked current.
