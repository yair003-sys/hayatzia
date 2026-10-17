# Security fixes — 2026-10-17

A batch of security hardening fixes to the owner's own app, on branch `sec-fixes`. Each change keeps behaviour
identical for honest users and does not weaken any existing rule. All DB logic is in one migration,
`apps/web/supabase/migrations/20261017130000_security_fixes.sql`, covered by pgTAP; app logic is covered by Vitest.

Summary (Hebrew) for the owner is in `docs/COMPANY.md`.

## H1 — ride-harm report abuse

**Risk.** `private.reports_ride_harm` auto-suspends a reported fan from rides when the two "shared a ride". It accepted
*any* `trip_requests` row (any status, either direction) from the last 30 days — so a request that was only ever
pending, or an accepted one on a match that never happened, was enough to trigger a suspension, and the suspension
could be erased by deleting the linking request.

**Fix.** The linking request must now have `status = 'accepted'` **and** be on a trip whose match has already kicked
off (`f.kickoff_at <= now()`, the same test the ride code uses). The restrictive delete policy
`trip_requests_keep_during_case` was widened: a rider cannot delete the linking request while **either** fan (the rider
or the trip's driver) is in an open harm case, not only when the deleter is.

**Proof.** `supabase/tests/database/security_fixes_rides.test.sql`: (a) a pending request does not suspend; (b) an
accepted request before kickoff does not; (c) an accepted request after kickoff does; (d) the rider cannot delete the
linking request while the driver is in an open case.

## M1 — push endpoint allowlist + alert delivery

**Risk.** (a) The database only checked `^https://` on `push_subscriptions.endpoint`; the host allowlist lived only in
`src/features/push/schema.ts`, so a crafted row could point the server at any https host. (c) The alert dispatch marked
an alert *sent* the moment it claimed it, so a run cut off after claiming lost those pushes.

**Fix.**
- (a) A CHECK constraint enforces the same host allowlist (fcm/mozilla/apple/windows and their subdomains, no port, no
  look-alike) in the database; non-matching rows are deleted in the migration.
- (b) `src/features/push/server/send.ts` re-checks the host with `isPushEndpoint` before sending (defence in depth) and
  lowers the per-request timeout from 8 s to 3 s.
- (c) `claim_alerts` now takes a short *lease* (`match_alerts.claimed_at`) instead of marking sent; the dispatch marks
  an alert delivered only after its round's pushes go out (`mark_alerts_sent`). A lease older than 2 minutes is
  re-claimable, so a crashed run is retried, never lost. The 30-minute stale sweep still prevents backlog starvation.

**Proof.** pgTAP `push.test.sql` (the DB allowlist, including a look-alike host) and `notifications.test.sql` (claiming
leases, `mark_alerts_sent` marks delivered); Vitest `src/features/push/server/send.test.ts` (a non-push host is skipped,
the valid one is sent with `timeout: 3000`).

## M2 — DM request enumeration of likely minors

**Risk.** `private.dm_thread_gate` raised `requests_closed` *before* counting the daily cap, and the app showed that
specific reason — so an attacker could cheaply probe who takes requests from their club / QR only (a strong signal of a
minor), and refused attempts never counted toward the cap.

**Fix.** The cap is counted first, under the lock. Both "setting closed" and "cap reached" now raise a single generic
code `requests_blocked` (and the app copy is one generic message). The app opens a request through a new
`public.request_dm(p_other)` which records each refused attempt in `private.dm_request_attempts` and counts those
attempts toward the cap, so probing many closed targets fills the attacker's own cap. The gate still enforces the
generic refusal for a direct insert (defence in depth), but cannot persist attempts across a rolled-back insert, so the
app path is the one that counts them.

**Proof.** pgTAP `security_fixes_dm.test.sql`: refused attempts are recorded and an *open* target is then refused solely
because the cap was reached; the gate raises the identical `requests_blocked` for a closed setting and a reached cap.
Vitest `src/features/dm/requests.test.ts` (one generic message for both).

## M3 — women-only rides on a freely-changeable gender

**Risk.** Women-only rides rested on a self-declared `profiles.gender` a fan could change at will.

**Fix.**
- Gender is **set once**: a fan may set it while it is null, but changing a non-null value is refused (`gender_locked`)
  in the `profiles_ride_stamp` trigger (an RLS `WITH CHECK` cannot compare old and new, so the trigger enforces it, as
  the team lock already does). Only an admin may change it afterwards, via `admin_set_gender`, logged in `admin_actions`
  as `gender_fix`.
- When `private.setting_on('rides_require_verification')` is **on**, a women-only ride needs an approved identity for
  the fan, checked by `private.ride_female_ok`. The document-sex marker is a single boolean, `fan_verifications.is_female`
  (null = the provider did not report sex; no raw document, number or birth date is stored). Until the real provider
  returns document sex it stays null and the gate falls back to the set-once gender (there is a `TODO(provider-sex)` in
  `ride_female_ok`). While the switch is **off** (production today), the self-declared gender check is unchanged, so
  honest users see no difference now.

**Proof.** pgTAP `security_fixes_rides.test.sql`: (a) a fan cannot change their own gender once set, an admin can; (b)
with the switch on, a non-verified fan cannot join a women-only ride and a verified-female one can, the marker overrides
the gender; (c) with the switch off, today's behaviour is unchanged.

## M4 — unlimited uploads + orphans

**Risk.** The storage policies only checked the own-folder; a fan could upload without limit, and failed uploads left
orphan objects with no row.

**Fix.**
- A per-fan cap of **300 objects per bucket** (clips / stand / market), enforced by a BEFORE INSERT trigger
  `private.storage_upload_cap` on `storage.objects`. 300 objects was chosen over a byte-sum because a count is cheap and
  index-friendly to enforce on every insert, and with the per-file size limits (50 / 15 / 10 MB) it bounds a fan's
  storage. (Documented in the migration comment.)
- `scripts/cleanup-clips.ts` now also deletes objects in the `clips` bucket with no matching `clips` row older than an
  hour, using the service-role function `public.orphan_clip_objects`.

**Proof.** pgTAP `security_fixes_storage.test.sql`: the 301st object is refused; the orphan finder returns an old file
with no row, and never a recent one or one with a matching row.

## M5 + L2 — group invite spam and block disclosure

**Risk.** `create_group` and `invite_to_group` had no rate limit, and `invite_to_group` raised a `blocked` error that
revealed a block between two *other* fans to the inviting admin.

**Fix.** At most **5 new groups per creator per day** and **30 invites per inviter per day** (`private.group_rate`), and
a **24-hour cooldown** before re-inviting a fan who declined or was removed (`private.group_invite_cooldown`). A fan who
has a block with any group member is now **silently skipped** (not refused with a tell-tale error), so an admin cannot
distinguish a block from any other reason a fan was not invited.

**Proof.** pgTAP `security_fixes_dm.test.sql`: the 6th group and the 31st invite in a day are refused; a declined fan is
skipped on re-invite; a blocked fan is silently skipped. `dm_groups.test.sql` was updated for the silent skip.

## L1 — push survives sign-out

**Risk.** `signOutAction` never removed the device's push subscription, so a signed-out browser kept getting
notifications.

**Fix.** `signOutAction` now takes the current device's endpoint (read in the browser by the new `SignOutButton`
client component) and deletes that `push_subscriptions` row (own-row RLS) before signing out. Without an endpoint
(no push, or no JS) sign-out still works.

**Proof.** Vitest `src/features/profile/server/actions.test.ts`: the subscription for the passed endpoint is deleted and
then the session is signed out; with no endpoint it still signs out.

## Not addressed

- Fully closing the M2 direct-insert bypass (a client inserting into `dm_threads` directly skips attempt-counting,
  though it still gets the generic refusal and the thread-count cap) would require revoking direct insert and routing
  every open through `request_dm`; left as a follow-up to avoid a large rewrite of the DM test suite.
