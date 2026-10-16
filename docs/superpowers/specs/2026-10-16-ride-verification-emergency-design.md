# Rides: strong identity verification for everyone and an emergency button: design

Status: approved by the owner in chat on 2026-10-16 ("גם הנוסעים עם תז וסריקת פנים", "נשמע לי מצויין" on the
package). Builds on the ride safety pack (`2026-10-15-ride-safety-design.md`, live). Engineering calls are Claude's.

## Why
Rides put strangers in one car. The owner: "לפני שמשתמש יוכל לפתוח קריאה הוא צריך לעבור אימותים ברמה גבוהה מאוד
כמו רישיון סריקת פנים", and "בזמן נהיגה יהיה חיוג מהיר למוקד חירום". Private rides stay free (no money between
fans and no commission: a private driver may not carry passengers for profit without a licence); the same
verification and emergency button also serve the organised bus trips (separate design,
`2026-10-16-bus-trips-design.md`).

## Owner's decisions
1. **Everyone in a ride is verified:** riders and drivers pass an ID document check and a live face scan
   (liveness + face match to the ID). Drivers also pass a **driving licence** check (valid, face matches) and register
   their **car** (licence plate checked against the Ministry of Transport open vehicle registry; riders see make,
   model and colour).
2. Phone verified by SMS too (the existing `rides_require_phone` switch turns on once the SMS provider exists).
3. **Emergency button during the ride:** one tap dials 100, alerts onefan admins with the ride's details, and marks
   the ride as an open incident (data kept, nothing deletable).
4. A "share with someone close" button sends the ride and driver details to a family member or friend.

## Claude's engineering calls
- **External identity provider, behind an adapter.** `features/verification/provider.ts` defines one interface
  (`startSession(userId, kind) → { url | sdkToken }`, `parseWebhook(request) → VerificationResult`); the first
  implementation targets a self-serve provider with Israeli ID support (owner chooses: Didit, Veriff or AU10TIX;
  until an account exists a `mock` provider is used in local/CI/staging only, never in production). Switching
  provider = a new adapter, no schema change.
- **We store results, never images.** Table `fan_verifications(user_id, kind 'identity'|'licence', status
  'pending'|'approved'|'rejected'|'expired', provider, provider_ref, approved_at, expires_at, reason_code)`;
  no photo, document number, face data or birth date from the document is stored. The provider's retention is set
  to its minimum. The document birth date is only compared (by the provider callback) with `profiles.birth_date`;
  a mismatch rejects with `dob_mismatch`.
- **Webhook only from the provider:** `/api/verification/webhook` checks the provider signature (secret in env,
  never logged; log codes only), is idempotent by `provider_ref`, and writes through a security definer RPC
  callable by `service_role` only.
- **Rules in the database:** offering a ride requires approved `identity` + approved `licence` + a registered car;
  requesting a ride requires approved `identity`. Enforced in the ride triggers (same place as the 18+ check),
  error codes `verify_identity`, `verify_licence`, `no_car`. Approvals expire after 2 years (`expires_at`),
  licence at its document expiry if the provider returns it.
- **Car:** `fan_cars(user_id, plate, make, model, colour, year, checked_at)`; plate looked up server-side in the
  data.gov.il vehicle dataset (public, no key); one active car per driver; plate visible only to accepted riders,
  make/model/colour on the ride card.
- **Verified badge:** a small "מאומת" mark next to verified fans in rides (and, optionally later, elsewhere).
- **Emergency:** a red "חירום" button on the ride screen for the driver and accepted riders, from departure until
  2 hours after full time. Tap → `tel:100` (works on phones) and, in parallel, `report_ride_emergency(trip_id)`
  RPC: creates an `ride_incidents` row (open), suspends nothing automatically, pushes all admins
  ("חירום בנסיעה: <from> → <match>"), and locks the trip and its requests from deletion while open (reuse the
  ride-safety case lock). One emergency per fan per trip per 10 minutes. No live location tracking (non-goal);
  the admin sees who, from where, when, car.
- **Share:** existing share action extended with the car's make/colour and the driver's verified status.
- **Accessibility and copy:** Hebrew, RTL; the emergency button ≥ 56px, labelled "חירום – חיוג ל-100".
- **Tests:** pgTAP for every gate (unverified rider refused, unverified driver refused, licence missing, no car,
  expired approval, webhook RPC callable only by service_role, emergency rate limit, incident lock); vitest for the
  adapter's webhook parsing and signature check (mock provider), Hebrew error mapping.

## Non-goals
Live GPS tracking, criminal record checks, in-app payment for private rides, automatic police dispatch.

## Owner actions before production
Choose and open an account with the identity provider (and later the SMS provider); lawyer review of the privacy
page text about verification.
