# League-wide private messages, message requests, QR code and birth date: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any fan can start a private 1:1 chat with any fan in the league (from a chat avatar or by scanning a personal QR code); the first message is a request the recipient accepts or blocks; a birth date at sign-up protects 16–17-year-olds.

**Architecture:** All rules live in one new SQL migration (RLS + security definer functions + triggers) covered by pgTAP; the Next.js app adds Server Actions and UI in `features/dm`, `features/chat`, `features/profile`, `features/first-run`, `features/admin`. Messages stay end-to-end encrypted; no message text reaches the server, push included.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase Postgres/RLS/Realtime, next-safe-action + zod, vitest, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-league-dms-design.md` (read it first; it is the source of every value below).

## Global Constraints

- Work on branch `league-dms` (risky DB work). Never merge to `main` without the owner's OK; backup branch `saved-before-league-dms` before the merge.
- One migration file: `apps/web/supabase/migrations/20261016100000_league_dms.sql`. Security definer functions use `set search_path = ''`; helpers in schema `private`; revoke `public`/`anon` execute explicitly.
- pgTAP tests in `apps/web/supabase/tests/database/league_dms.test.sql`; CI `web-db.yml` must be green; `web-ci.yml` must be green.
- No DM plaintext to the server, ever (no DM report with content). Push text for a request: `בקשת הודעה מ-<nick>` only.
- Request setting values exactly: `'everyone' | 'team' | 'qr'`; null = age default (18+ → everyone, 16–17 → team).
- Caps exactly: 20 new request threads per sender per 24 h; 5 per 24 h if the sender's account is younger than 3 days. QR-opened threads are outside the cap.
- Birth date: required; under 16 refused (`too_young`); not in the future, not before 1900-01-01; set once by the fan; never selectable by other fans.
- QR code: random url-safe string ≥ 22 chars, unique, stamped by the database; URL `/add/<code>`.
- Copy is Hebrew, RTL; error codes map to Hebrew in the feature's schema file (existing pattern `groupErrorHe`).
- Existing threads are backfilled `accepted_at = created_at`. Groups stay same-club.
- Packages only via `web-deps.yml` dispatch (never hand-edit `package.json`).
- Update `docs/DATA_MODEL.md`, `docs/COMPANY.md`, `docs/ROADMAP.md` in the same branch.

## Review Focus

1. A fan without a birth date yet (all existing fans on day one) opens the app: they must be asked once, keep reading existing threads, and be refused only for new threads / rides with a clear Hebrew message.
2. Sender writes a second message before acceptance (e.g. double tap, two devices): exactly one message lands; the second gets `awaiting_accept`.
3. Both fans message each other first at the same moment (two requests): one thread (unique pair) and replying counts as accepting.
4. A QR code shared as a screenshot on social media after reset: the old code returns `bad_code`, never a thread.
5. A blocked fan scans the QR code of the fan who blocked them (or the reverse): refused `blocked`, no thread created.

---

### Task 1: Profile fields: birth date, request setting, QR code

**Files:**
- Create: `apps/web/supabase/migrations/20261016100000_league_dms.sql` (section 1)
- Create: `apps/web/supabase/tests/database/league_dms.test.sql` (section 1)

**Interfaces:**
- Produces: `profiles.birth_date date`, `profiles.dm_requests text`, `profiles.qr_code text unique not null` (default stamped); `private.is_adult(p_user uuid) returns boolean` (birth_date ≤ today − 18 years); `private.dm_setting(p_user uuid) returns text` (stored value or age default); RPCs `public.set_birth_date(p_date date) returns void` (only when null; raises `too_young`, `bad_date`, `already_set`), `public.set_dm_requests(p_value text) returns void`, `public.my_private_profile() returns table(birth_date date, dm_requests text, qr_code text)`, `public.reset_qr_code() returns text`.

- [ ] **Step 1: Write failing pgTAP tests**: `set_birth_date` accepts 1990-05-01; refuses a date 15 years ago (`too_young`), future (`bad_date`), second call (`already_set`); another fan selecting `birth_date`/`qr_code`/`dm_requests` from `profiles` is denied (column privilege); `private.dm_setting` is `everyone` for an 18+ fan with null setting and `team` for a 17-year-old; `reset_qr_code()` returns a new value ≥ 22 chars different from the old; `qr_code` filled for a new profile.
- [ ] **Step 2: Run** `supabase test db` in CI (push branch, `web-db.yml`). Expected: the new tests fail.
- [ ] **Step 3: Implement section 1** of the migration: columns, checks, unique index on `qr_code` (backfill existing rows), column-level select grant on `profiles` that excludes the three new columns (follow the ride-safety pattern for `gender`), the functions above, revokes.
- [ ] **Step 4: Run CI** `web-db.yml`. Expected: PASS.
- [ ] **Step 5: Commit** `db: profile birth date, DM request setting and QR code`.

### Task 2: Thread rules: league-wide, requests, caps, keys, bans

**Files:**
- Modify: `apps/web/supabase/migrations/20261016100000_league_dms.sql` (section 2)
- Modify: `apps/web/supabase/tests/database/league_dms.test.sql` (section 2)

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `dm_threads.accepted_at timestamptz`, `dm_threads.opened_by uuid` (stamped = auth.uid()), `dm_threads.via_qr boolean not null default false`; `private.can_dm(p_other uuid) returns boolean` (not blocked either way, other's `dm_setting` allows me, or a thread exists, or we share a group); `public.accept_dm_thread(p_thread uuid) returns void` (only the non-opener, once); error codes `requests_closed`, `awaiting_accept`, `rate_limit`, `banned`, `blocked`, `no_birth_date`.

- [ ] **Step 1: Write failing pgTAP tests**: fans of different clubs open a thread (succeeds, `accepted_at` null); opener's second message before accept → `awaiting_accept`; recipient's reply sets `accepted_at` (replying = accepting); `accept_dm_thread` by opener refused; recipient with `dm_requests='team'` refuses a cross-club opener (`requests_closed`); `'qr'` refuses everyone without QR; 21st new thread in 24 h → `rate_limit`, 6th for a 2-day-old account; banned fan → `banned`; fan without birth date opening → `no_birth_date`; `device_keys` of a stranger whose setting refuses me not selectable, selectable once a thread exists or we share a group; existing threads backfilled accepted; group invites still same-club only.
- [ ] **Step 2: Run CI.** Expected: FAIL.
- [ ] **Step 3: Implement section 2**: replace `same_team` in `dm_threads_stamp` with `private.can_dm` + ban + birth-date + cap checks; add columns + backfill; extend `dm_messages_stamp` with the one-message rule and the reply-accepts rule; replace `device_keys_read` policy using `private.can_dm(user_id)`; `accept_dm_thread`.
- [ ] **Step 4: Run CI.** Expected: PASS.
- [ ] **Step 5: Commit** `db: league-wide DM threads with requests, caps and key access`.

### Task 3: QR open and block counter

**Files:**
- Modify: the same migration (section 3) and test file (section 3)

**Interfaces:**
- Produces: `public.open_dm_by_code(p_code text) returns uuid` (thread id; creates or returns, `accepted_at = now()`, `via_qr = true`; refuses `bad_code`, `blocked`, `banned`, `self`, `no_birth_date`; skips setting and cap); `public.qr_card(p_code text) returns table(nick text, team_id text)` (for the `/add` page; `bad_code`); `public.fan_block_counts` view or table `private.block_counts(user_id, blocked_by_30d int)` maintained by trigger on `blocks`; admin RPC `public.admin_most_blocked(p_limit int) returns table(user_id uuid, nick text, blocked_by int)` guarded by `app_admins`.

- [ ] **Step 1: Write failing pgTAP tests**: scanning opens an accepted thread even with recipient setting `'qr'` and sender over the cap; old code after `reset_qr_code` → `bad_code`; blocked either way → `blocked`; own code → `self`; `admin_most_blocked` returns a fan blocked by 3 fans with count 3 for an admin and is refused for a non-admin.
- [ ] **Step 2: Run CI.** Expected: FAIL.
- [ ] **Step 3: Implement section 3.**
- [ ] **Step 4: Run CI.** Expected: PASS; then commit `db: open DM by QR code; most-blocked list for admins`.

### Task 4: Birth date in sign-up and the one-time prompt; rides use it

**Files:**
- Modify: `apps/web/src/features/first-run/schema.ts`, `schema.test.ts` (add `birthDate`), `apps/web/src/features/profile/server/actions.ts` (+ test), the onboarding form under `apps/web/src/app/(public)/onboarding/`
- Create: `apps/web/src/features/profile/components/birth-date-sheet.tsx`, rendered from `apps/web/src/app/(app)/layout.tsx` when `my_private_profile().birth_date` is null
- Modify: `apps/web/src/features/team-life/server/actions.ts` and the ride safety checks to read adulthood from birth date (DB side: `private.is_adult` used by the ride rules in place of `adult_confirmed_at`; add to the migration section 1 with a pgTAP case)
- Modify: `apps/web/src/lib/supabase/database.types.ts` (hand-edit on the branch; the bot regenerates on main)

**Interfaces:**
- Produces: `birthDateSchema` (zod, `YYYY-MM-DD`, ≥ 16 years, ≤ 1900 refused) exported from `features/first-run/schema.ts`; `setBirthDateAction({ birthDate })`; `birthDateErrorHe(code)`.

- [ ] **Step 1: Failing vitest** for `birthDateSchema` (16 years ago today passes, one day short fails, `1899-12-31` fails, future fails) and `birthDateErrorHe('too_young') === 'ההרשמה מגיל 16'`.
- [ ] **Step 2: Run** `web-ci.yml`. Expected: FAIL.
- [ ] **Step 3: Implement**: day/month/year fields (RTL, `<label>`s, reason line "כדי להגן על בני נוער. לא מוצג לאף אחד"); createProfile calls `set_birth_date` after insert; the sheet for existing fans; rides read adulthood from the DB.
- [ ] **Step 4: Run CI.** Expected: PASS; commit `web: birth date at sign-up and one-time prompt; rides use it`.

### Task 5: DM server actions and Hebrew errors

**Files:**
- Modify: `apps/web/src/features/dm/server/actions.ts`, `apps/web/src/features/dm/schema.ts`, `schema.test.ts`, `apps/web/src/features/dm/server/queries.ts`

**Interfaces:**
- Consumes: Tasks 2–3 RPCs.
- Produces: `openThreadAction({ otherId })` (no longer same-team; maps new codes), `acceptThreadAction({ threadId })`, `blockFromRequestAction({ threadId })` (inserts into `blocks` for the other member), `openByCodeAction({ code })`, `resetQrAction()`, `setDmRequestsAction({ value })`, `dmErrorHe(code)`; inbox query returns `requests: Thread[]` (where `accepted_at is null and opened_by <> me`) and `requestsCount`, same keyset pagination, no extra round trip per row.

- [ ] **Step 1: Failing vitest** for `dmErrorHe`: `requests_closed` → `האוהד הזה מקבל הודעות רק מאוהדי הקבוצה שלו או דרך ברקוד`, `awaiting_accept` → `ההודעה נשלחה. אפשר לכתוב שוב כשיאשרו`, `rate_limit` → `שלחת הרבה בקשות היום. נסה מחר`, `bad_code` → `הברקוד לא תקף`, `no_birth_date` → `צריך להשלים תאריך לידה`, `blocked` → `אי אפשר לפתוח שיחה עם האוהד הזה`.
- [ ] **Step 2: Run CI.** FAIL. **Step 3: Implement.** **Step 4: Run CI.** PASS. **Step 5: Commit** `web: DM actions for requests, QR and settings`.

### Task 6: UI: inbox requests, request bar, pending composer, avatar button

**Files:**
- Modify: `apps/web/src/features/dm/components/inbox-list.tsx`, `dm-thread.tsx`, `thread-parts.tsx`; `apps/web/src/features/chat/components/chat-parts.tsx` (+ `chat-parts.test.tsx`) for the avatar button
- Create: `apps/web/src/features/dm/components/request-bar.tsx`, `apps/web/src/features/chat/components/fan-sheet.tsx`

**Interfaces:**
- Consumes: Task 5 actions.

- [ ] **Step 1: Failing Testing Library tests**: a chat row from another fan renders a button `aria-label="שלח הודעה פרטית ל-<nick>"`, own row renders none; request bar shows "אשר והמשך שיחה" and "חסום" for the recipient and nothing for the opener; opener's composer disabled with the `awaiting_accept` line until accepted.
- [ ] **Step 2–4:** run CI (FAIL), implement, run CI (PASS). Inbox shows "בקשות (N)" above threads; avatar sheet shows nick, club colours, "שלח הודעה פרטית" → `openThreadAction`.
- [ ] **Step 5: Commit** `web: message requests UI and chat avatar entry`.

### Task 7: QR screen, scan and `/add/<code>`

**Files:**
- Create: `apps/web/src/features/dm/components/my-qr.tsx`, `apps/web/src/app/(app)/inbox/qr/page.tsx`, `apps/web/src/app/(app)/add/[code]/page.tsx`
- Modify: inbox header (button "הברקוד שלי"), `apps/web/src/app/(app)/me/` settings ("מי יכול לשלוח לי בקשות" radio group with the three options)

**Interfaces:**
- Consumes: `my_private_profile`, `resetQrAction`, `qr_card`, `openByCodeAction`, `setDmRequestsAction`.

- [ ] **Step 1:** dispatch `web-deps.yml` with `inputs[packages]=qrcode` and dev `@types/qrcode`; wait for its commit on the branch's base, rebase.
- [ ] **Step 2: Failing tests**: `my-qr` renders an `<img alt="הברקוד שלי">` whose data encodes `${origin}/add/<code>`; `/add/[code]` with a bad code shows `הברקוד לא תקף`.
- [ ] **Step 3: Implement**: QR rendered client-side from the code; "חדש ברקוד" with in-page confirm; "סרוק ברקוד" uses `BarcodeDetector` + camera when available, else explains to use the phone camera; `/add/[code]` shows the card and "שלח הודעה" (signed-out → login then back).
- [ ] **Step 4: Run CI.** PASS. **Step 5: Commit** `web: personal QR code, scan and add page`.

### Task 8: Push for requests, admin most-blocked, docs

**Files:**
- Modify: `apps/web/src/features/push/server/actions.ts` (+ test) for request copy; `apps/web/src/features/admin/` reports screen gains "חסומים על ידי הרבה אוהדים"; `docs/DATA_MODEL.md`, `docs/COMPANY.md` (task 14–15 → done on merge), `docs/ROADMAP.md`; privacy draft page line that private messages are open league-wide.

- [ ] **Step 1: Failing vitest**: request push body equals `בקשת הודעה מ-<nick>` and contains no message field.
- [ ] **Step 2–4:** CI FAIL → implement → CI PASS.
- [ ] **Step 5: Commit** `web: request push, admin most-blocked, docs`.

### Task 9: Staging, preview, owner check, production

- [ ] Apply the migration to Supabase staging (SQL editor), verify with read-only queries.
- [ ] Rebuild `demo-preview` from the branch head (`git reset --hard <sha>` + a marker change to `apps/web/.preview-branch`), confirm the Vercel preview succeeds.
- [ ] Check at phone size: sign-up with birth date, the one-time sheet, avatar → request, accept / block, QR screen and `/add/<code>`.
- [ ] Owner OK → load the production migration for his Run → verify "Success" → backup branch `saved-before-league-dms` → merge to `main` → CI green → check production at phone size.
