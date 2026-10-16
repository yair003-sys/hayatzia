# Rides: identity verification for everyone and an emergency button: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every fan in a ride passes an ID + face check (drivers also a licence held ≥ 2 years and a car found in the
Ministry of Transport registry), behind a rollout switch; during a ride a red button dials 100 and alerts the admins.

**Architecture:** One SQL migration holds every rule (tables, gates in the existing ride triggers, restrictive select
policy that hides unverified fans' rides, service-role-only result RPC, emergency RPC and locks), covered by pgTAP. The
app adds `features/verification` (provider interface, env-selected `mock` provider, HMAC fingerprint, signed webhook,
data.gov.il vehicle client, server actions, `/me/verify` page) and extends rides (`features/team-life`) and the admin
screen (`features/admin`).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase Postgres/RLS, next-safe-action + zod,
@t3-oss/env-nextjs, node:crypto, vitest + Testing Library, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-16-ride-verification-emergency-design.md` (its "Builder-check answers"
override earlier text). Builds on `2026-10-15-ride-safety-design.md` and migration `20261015220000_ride_safety.sql`.

## Global Constraints

- Branch `ride-verification` from `origin/main`; push the branch, never push to or merge into `main`.
- One migration: `apps/web/supabase/migrations/20261016200000_ride_verification.sql`; pgTAP:
  `apps/web/supabase/tests/database/ride_verification.test.sql`. Security definer + `set search_path = ''`; every
  public function revokes `public, anon` and grants exactly `authenticated` and/or `service_role`.
- Gates run only when `private.setting_on('rides_require_verification')`; seeded `false`. Tests switch it on.
- Actions: `offer` → identity + licence + car; `seek` → identity; a request on a `seek` (answering as driver) →
  identity + licence + car; a request on an `offer` → identity; `meet` unaffected. Codes `verify_identity`,
  `verify_licence`, `no_car`.
- Store results, never images, document numbers or document birth dates. `doc_fingerprint` = HMAC-SHA256 (server
  secret) of the normalised document number, computed in the webhook; unique among approved identities.
- Result codes: `dob_mismatch`, `duplicate_identity` (same fingerprint on another account, or on a fan suspended from
  rides or banned), `licence_too_new` (issued < 2 years ago), `verify_limit` (3 sessions per fan per kind in total;
  admin reset). Approvals expire after 2 years, a licence at its document expiry if earlier.
- Admin: reset attempts, correct a fan's birth date; both logged in `admin_actions`.
- Webhook `/api/verification/webhook`: provider signature (HMAC) check, idempotent by `provider_ref`, writes through a
  `service_role`-only RPC. Never log secrets or payloads; log codes only.
- `mock` provider: env-selected, refuses to construct when `NEXT_PUBLIC_APP_ENV` is `production`; demo path
  "אמת אותי (דמו)" only when the provider is mock, always labelled demo.
- Car: plate checked server-side in data.gov.il (CKAN `datastore_search`, resource
  `053cea08-09bc-40ec-8f7a-156f0677aff3`) with a timeout; mocked in tests; store make/model/colour/year; one active
  car; plate visible only to the driver and accepted riders.
- Emergency: copy "חירום – חיוג ל-100", `tel:100`, ≥ 56px; `report_ride_emergency(trip_id)`; `ride_incidents`; one per
  fan per trip per 10 minutes; admin push "חירום בנסיעה" with the route only; open-incidents list with an
  unanswered badge; trip and requests not deletable while open; onefan is not a 24/7 centre, 100 is the path.
- Hebrew RTL copy; DB codes → Hebrew in `features/verification/schema.ts`. `database.types.ts` hand-edited here.
- Never touch a Supabase project, Vercel or production. CI is the build machine.

## Review Focus

1. A fan taps the emergency button twice in panic (or on two devices): one incident, one admin push, the phone still
   dials 100 both times.
2. The switch is turned on while unverified fans have open offers with accepted riders: nothing is deleted, the offers
   are hidden from others, the fan sees a banner; the riders' existing acceptance stays.
3. The provider sends the same webhook twice, or out of order after an approval: the second changes nothing and
   returns the stored status (no double count, no flip from approved to rejected).
4. A plate typed with dashes or spaces ("12-345-67"), or the registry is slow/down: normalised; a timeout gives a
   clear Hebrew "try again", never a stored car.
5. A fan re-verifies after expiry with the same ID: the old approval is superseded (no unique-index clash), not a
   `duplicate_identity`.

---

### Task 1: Database: verification sessions, results, cars, gates, hiding

**Files:**
- Create: `apps/web/supabase/migrations/20261016200000_ride_verification.sql` (sections 1–4)
- Create: `apps/web/supabase/tests/database/ride_verification.test.sql` (sections 1–4)

**Interfaces:**
- Produces tables `fan_verifications(id, user_id, kind 'identity'|'licence', status 'pending'|'approved'|'rejected'|'expired', provider, provider_ref unique, doc_fingerprint, reason_code, counted, approved_at, expires_at, created_at, updated_at)`, `fan_cars(id, user_id, plate, make, model, colour, year, checked_at, active, created_at)` (no fan access).
- `begin_verification(p_kind text) → uuid` (session id; `bad_kind`, `already_verified`, `verify_identity` for a licence before identity, `verify_limit`).
- `verification_result(p_session uuid, p_provider text, p_provider_ref text, p_approved boolean, p_reason text, p_fingerprint text, p_doc_birth_date date, p_licence_issued date, p_doc_expires date) → text` (final status; service_role only; `bad_session`).
- `my_verification() → (required, identity_status, identity_reason, identity_left, licence_status, licence_reason, licence_left, car_plate, car_make, car_model, car_colour, car_year)`; `my_verification_session(p_session uuid) → text` (kind of the caller's own pending session, else null).
- `set_fan_car(p_user uuid, p_plate text, p_make text, p_model text, p_colour text, p_year int) → void` (service_role only; `bad_plate`, `rate_limit` after 5 per 24 h); `remove_my_car() → boolean`.
- `ride_trust(p_users uuid[]) → (user_id, identity_ok, driver_ok, car_make, car_model, car_colour)` (caller's club, ≤ 200; car only for a fan with a visible current offer); `my_ride_plates(p_trips uuid[]) → (trip_id, plate)` (offer: owner's car to the owner and accepted requesters; seek: the accepted requester's car to the owner and that requester).
- `admin_reset_verification(p_user uuid, p_kind text) → int`, `admin_set_birth_date(p_user uuid, p_date date) → void`, `admin_verification_issues(p_limit int) → (user_id, nick, kind, reason_code, used, created_at)`; audit actions `verify_reset`, `birth_date_fix`.
- Private: `private.verified(uuid, text)`, `private.has_car(uuid)`, `private.ride_verify_missing(p_user uuid, p_driver boolean) → text` (null when ok or switch off), `private.ride_poster_ok(uuid, text)`.

- [ ] **Step 1: Write the failing pgTAP tests** (sections 1–4): with the switch off an unverified fan still offers; on:
  unverified offer `verify_identity`, identity-only offer `verify_licence`, no car `no_car`, all three ok; seek needs
  identity only; meet unaffected; request on offer needs identity; request on seek needs the driver set; expired
  approval → `verify_identity`; unverified fan's offer hidden from another fan, visible to self; accepting an
  unverified rider → `peer_not_verified`; `verification_result` refused to `authenticated` (42501); approve, then the
  same call again returns `approved` and changes nothing; `dob_mismatch`; `duplicate_identity` for another account's
  fingerprint and for a ride-suspended or banned fan's; same fan re-verifying with the same fingerprint is approved;
  `licence_too_new`; licence `expires_at` = document expiry when earlier; 4th `begin_verification` → `verify_limit`,
  admin reset (logged) opens it again, non-admin reset `not_admin`; `admin_set_birth_date` (logged; `not_admin`);
  fans cannot select `fan_verifications`/`fan_cars`; `set_fan_car` refused to fans; plate visible to an accepted
  rider, not to a pending one; `ride_trust` flags and car make.
- [ ] **Step 2: Push and dispatch `web-db.yml` on the branch.** Expected: FAIL (functions do not exist).
- [ ] **Step 3: Implement sections 1–4** of the migration: setting row, tables + indexes (`(user_id, kind, created_at desc)`, unique `doc_fingerprint where kind = 'identity' and status = 'approved'`, unique `provider_ref`, unique `fan_cars (user_id) where active`), RLS on with no policies, functions above, `create or replace` of `private.trips_ride_rules` and `private.trip_requests_ride_rules` adding the gate, restrictive select policy `trips_verified_or_hidden`, `admin_actions` check extended (also `incident_ack`, `incident_close` for Task 2). Approval supersedes the fan's earlier approved row of that kind (`expired`) before setting `approved`. Advisory lock per fan in `begin_verification`.
- [ ] **Step 4: Dispatch `web-db.yml`.** Expected: PASS.
- [ ] **Step 5: Commit** `db: ride verification sessions, results, cars and gates`.

### Task 2: Database: emergency incidents

**Files:**
- Modify: the same migration (section 5) and test file (section 5)

**Interfaces:**
- Produces `ride_incidents(id, trip_id, fixture_id, reporter_id, driver_id, from_city, pickup, car, status 'open'|'closed', acknowledged_at, acknowledged_by, closed_at, closed_by, created_at)` (no FKs: the record stays; no fan access).
- `report_ride_emergency(p_trip uuid) → (incident_id uuid, created boolean, from_city text, fixture_id bigint)`: participants only (owner and accepted requesters of an offer/seek; `not_in_ride`), window kickoff − (depart_before_min + 30 min) … kickoff + 4 h (`emergency_window`); within 10 minutes of the caller's last one for the trip returns it with `created = false`.
- `admin_open_incidents(p_limit int) → (id, created_at, acknowledged_at, trip_id, kickoff_at, from_city, pickup, reporter_nick, driver_nick, car)`, `admin_incident_count() → int` (open, unacknowledged), `admin_ack_incident(p_id uuid) → boolean`, `admin_close_incident(p_id uuid) → boolean` (audited).
- `private.ride_case_open(uuid)` also true for a fan involved in an open incident; restrictive delete policies `trips_keep_during_incident`, `trip_requests_keep_during_incident`.

- [ ] **Step 1: Write the failing pgTAP tests**: an outsider → `not_in_ride`; meet trip → `not_in_ride`; outside the window → `emergency_window`; accepted rider creates one (`created`); again at once → `created = false`, still one row; driver cannot delete the trip, rider cannot delete the request; `my_ride_case_open()` true for both; `admin_incident_count` 1, ack → 0 and logged; non-admin list `not_admin`; close → trip deletable again.
- [ ] **Step 2: Dispatch `web-db.yml`.** Expected: FAIL.
- [ ] **Step 3: Implement section 5** (advisory lock per reporter + trip; indexes `(trip_id) where status = 'open'`, `(reporter_id, trip_id, created_at desc)`, `(created_at desc) where status = 'open'`).
- [ ] **Step 4: Dispatch `web-db.yml`.** Expected: PASS.
- [ ] **Step 5: Commit** `db: ride emergency incidents`.

### Task 3: Verification core: types, codes, provider, mock, fingerprint, env

**Files:**
- Modify: `apps/web/src/lib/env.ts` (server: `VERIFICATION_PROVIDER: z.enum(['mock']).optional()`, `VERIFICATION_WEBHOOK_SECRET: z.string().min(32).optional()`, `VERIFICATION_FINGERPRINT_SECRET: z.string().min(32).optional()`)
- Modify: `apps/web/src/lib/supabase/database.types.ts` (tables and functions of Tasks 1–2)
- Create: `apps/web/src/features/verification/schema.ts` + `schema.test.ts`
- Create: `apps/web/src/features/verification/provider.ts`, `mock-provider.ts` + `mock-provider.test.ts`, `fingerprint.ts` + `fingerprint.test.ts`, `server/select-provider.ts` + test

**Interfaces:**
- `verificationErrorHe(message: string | null | undefined): string | null` (every DB code of Tasks 1–2 plus `plate_not_found`, `registry_unavailable`); `statusLabel(status, reason)`; `formatPlate(plate: string): string` ("1234567" → "12-345-67", "12345678" → "123-45-678"); `normalisePlate(input: string): string | null` (digits only, 7–8).
- `provider.ts`: `type VerificationKind = 'identity' | 'licence'`; `type VerificationResult = { sessionId; providerRef; approved: boolean; reasonCode: string | null; documentNumber: string | null; docBirthDate: string | null; licenceIssued: string | null; docExpires: string | null }`; `interface VerificationProvider { name: string; startSession(i: { sessionId: string; userId: string; kind: VerificationKind }): Promise<{ url: string } | { sdkToken: string }>; parseWebhook(request: Request): Promise<VerificationResult> }`; `class WebhookError(code: 'bad_signature' | 'bad_payload')`.
- `createMockProvider({ appEnv, secret }): VerificationProvider` (throws in production); `signMock(body: string, secret: string): string` (hex HMAC, header `x-onefan-signature`); start URL `/me/verify/demo?session=<id>`.
- `docFingerprint(documentNumber: string, secret: string): string` (64 hex; normalise: strip non-alphanumerics, uppercase, all-digit numbers left-padded to 9).
- `getVerificationProvider(): VerificationProvider | null`; `fingerprintSecret(): string | null` (non-production falls back to a fixed labelled key; production needs the env value).

- [ ] **Step 1: Write failing vitest tests**: Hebrew for every code; `formatPlate`, `normalisePlate("12-345-67") === "1234567"`, `normalisePlate("123") === null`; mock refuses production; good signature parses; tampered body / wrong secret / missing header → `bad_signature`; bad JSON → `bad_payload`; fingerprint stable, 64 hex, equal for "012345678" and "12345678", different for another secret; `getVerificationProvider()` mock by default outside production, null in production even with `VERIFICATION_PROVIDER=mock`.
- [ ] **Step 2: Push and dispatch `web-ci.yml`.** Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the files above (timing-safe compare on equal-length digests).
- [ ] **Step 4: Dispatch `web-ci.yml`.** Expected: PASS (typecheck, lint, tests, build).
- [ ] **Step 5: Commit** `web: verification provider interface, mock provider and fingerprint`.

### Task 4: Webhook route and vehicle registry client

**Files:**
- Create: `apps/web/src/features/verification/server/webhook.ts` + `webhook.test.ts`, `apps/web/src/app/api/verification/webhook/route.ts`
- Create: `apps/web/src/features/verification/server/vehicle-registry.ts` + test

**Interfaces:**
- `handleVerificationWebhook(request: Request, deps?: { provider; admin; secret }): Promise<Response>`: no provider → 404; `WebhookError` → 401/400; no fingerprint secret → 503; RPC `verification_result` via the admin client; 200 `{ status }`; errors logged as codes only.
- `lookupVehicle(plate: string, opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<Vehicle | null>`, `type Vehicle = { plate; make; model; colour; year: number | null }`; `class RegistryError('unavailable')`. Fields `tozeret_nm`, `kinuy_mishari` (fallback `degem_nm`), `tzeva_rechev`, `shnat_yitzur`; filter `{"mispar_rechev": <number>}`; timeout 5000 ms.

- [ ] **Step 1: Failing tests**: valid signed body → RPC called once with the fingerprint (never the number) and 200; bad signature → 401, no RPC; RPC error → 500 and `console.error` called without the secret or payload; no provider → 404. Registry: found → mapped; empty → null; HTTP 500 / abort → `RegistryError`; request URL has the resource id and the numeric filter.
- [ ] **Step 2–4:** dispatch `web-ci.yml` red → implement → green.
- [ ] **Step 5: Commit** `web: verification webhook and vehicle registry lookup`.

### Task 5: Server actions: verify, demo, car, emergency, admin

**Files:**
- Create: `apps/web/src/features/verification/server/actions.ts` + test, `server/queries.ts`
- Modify: `apps/web/src/features/team-life/server/actions.ts` (+ test), `team-life/server/matches.ts`, `team-life/ride-safety.ts` (`rideErrorHe` delegates to `verificationErrorHe`; `shareText` gains `car` and `verified`; `emergencyOpen(kickoffSec, departBeforeMin, now)`)
- Modify: `apps/web/src/features/admin/server/actions.ts`, `queries.ts`, `schema.ts` (labels for the new audit actions)

**Interfaces:**
- `startVerificationAction({ kind }) → { url } | { error }`; `demoApproveAction({ sessionId }) → { ok } | { error }` (mock only; signs a mock body with fake document number `DEMO-<user id>`, the fan's own birth date, licence issued 5 years ago, and runs `handleVerificationWebhook`); `registerCarAction({ plate })`, `removeCarAction({})`; `getMyVerification(): Promise<MyVerification | null>`.
- `reportEmergencyAction({ tripId }) → { ok, created }`: pushes `admin_user_ids()` `{ title: 'חירום בנסיעה', body: '<from> → <match>', url: '/admin/reports', tag: 'ride-emergency' }` only when `created`; `matchLabelOf(league, fixtureId): string`.
- Admin: `resetVerificationAction({ userId, kind })`, `fixBirthDateAction({ userId, birthDate })`, `ackIncidentAction({ id })`, `closeIncidentAction({ id })`; queries `getOpenIncidents()`, `getIncidentCount()`, `getVerificationIssues()`.

- [ ] **Step 1: Failing tests**: emergency pushes admins once with route only, not when `created = false`, Hebrew error on `not_in_ride`; `shareText` includes "רכב: מאזדה 3 · לבן" and "נהג מאומת"; `emergencyOpen` true 1 h before kickoff with 120-min departure, false 5 h after; `rideErrorHe('verify_identity')` Hebrew.
- [ ] **Step 2–4:** red → implement → green in `web-ci.yml`.
- [ ] **Step 5: Commit** `web: verification, car and emergency actions`.

### Task 6: Screens

**Files:**
- Create: `apps/web/src/app/(app)/me/verify/page.tsx`, `apps/web/src/app/(app)/me/verify/demo/page.tsx`, `features/verification/components/verify-panel.tsx`, `demo-session.tsx`
- Create: `apps/web/src/features/team-life/components/emergency-button.tsx` + test
- Modify: `team-life/components/boards.tsx`, `team-life/server/queries.ts`, `app/(app)/stand/trips/page.tsx`, `app/(app)/me/page.tsx` (link "אימות לנסיעות")
- Create: `features/admin/components/incident-list.tsx`, `verification-issue-list.tsx`; Modify `app/(app)/admin/reports/page.tsx`

**Interfaces:**
- `EmergencyButton({ tripId })`: `<a href="tel:100">` named "חירום – חיוג ל-100", `min-h-14`, fires `reportEmergencyAction` without blocking the call; note "onefan אינה מוקד חירום 24/7. בסכנה מחייגים 100".
- `Trip` gains `trust: { identity: boolean; driver: boolean; car: string | null } | null` and `plate: string | null` (one `ride_trust` call, one `my_ride_plates` call per page).

- [ ] **Step 1: Failing component test**: the emergency link has `href="tel:100"`, the exact name, class `min-h-14`, and a click calls the action with the trip id.
- [ ] **Step 2–4:** red → implement → green in `web-ci.yml` (build + Playwright smoke).
- [ ] **Step 5: Commit** `web: verification screens, verified badge, car on ride cards, emergency button`.

### Task 7: Docs

- Modify: `docs/DATA_MODEL.md`, `docs/RIDE_SAFETY.md` (enforcement + incident procedure for the emergency button, not a 24/7 centre; how to turn the switch on), `docs/ROADMAP.md`, `apps/web/src/app/(public)/privacy/page.tsx` (verification by an external provider, only the result and a keyed fingerprint stored, duplicate identity blocked), `docs/COMPANY.md` (task 16 → "בנוי, ממתין לבדיקה", date bump).
- [ ] Commit `docs: ride verification and emergency`; final `web-ci.yml` and `web-db.yml` green on the head SHA.
