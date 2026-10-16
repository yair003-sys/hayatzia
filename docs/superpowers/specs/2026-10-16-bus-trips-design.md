# Organised bus and minibus trips to matches: design

Status: approved by the owner in chat on 2026-10-16 ("נשמע לי מצויין"). Owner's words: "נתמקד בהסעה של אוטובוס
ומיניבוס ונחתוך ברווחים … משולב אבל בטוח ככה שלא יהיה הפסדים … אם ההסעה עוברת את המכסה … הופכת מספיק רווחית
ונוחה לכיס לכל אוהד זה מושלם". Engineering calls are Claude's.

## Why
Revenue from transport must come from licensed operators, not private drivers. A bus of one crowd to an away game
also builds the community. The model must never lose money: a trip runs only when enough fans join.

## Owner's decisions
1. **Combined:** a trip can be opened by onefan, by a licensed bus company, or by a fan organisation; the vehicle
   and driver are always a licensed operator's.
2. **Runs only if it fills:** each trip has a minimum number of passengers, a maximum price per seat and a closing
   time. Booking only *holds* the amount on the fan's card (J5 authorisation); at closing time, if the minimum is
   reached the trip is confirmed and charged, otherwise it is cancelled and every hold is released. No one, onefan
   included, loses money.
3. **The more join, the cheaper:** the vehicle cost is fixed, so the seat price falls as seats fill, shown live
   ("עוד 5 אוהדים והמחיר יורד ל-₪45"); everyone is charged the final price, never more than they approved.
4. **Revenue split per ticket:** operator share, onefan share, and an organiser share when a fan organisation
   organised it; percentages per operator agreement.
5. Same safety as rides: every passenger verified (ID + face) and the emergency button during the trip.

## Claude's engineering calls
- **Pricing formula (database, one place):** `seat_price(n) = ceil((vehicle_cost + onefan_fee_total +
  organiser_fee_total) / n)` for `n ≥ min_passengers`, capped at `max_price`; the trip's `vehicle_cost`,
  `capacity`, `min_passengers`, `max_price`, fee rules and `closes_at` are set when it is opened (by an admin, an
  operator user or an approved organiser) and frozen once the first booking exists. Shown in the app with the next
  price step. Money in agorot (integers).
- **Payment provider behind an adapter** (`features/payments/provider.ts`): `authorize(amount, bookingId) →
  holdRef`, `capture(holdRef, amount ≤ authorised)`, `release(holdRef)`, webhook parsing with signature check.
  First adapter: an Israeli processor with J5 support (owner chooses and opens the account); `mock` adapter in
  local/CI/staging only. We never see or store card numbers (hosted payment page / iframe of the processor).
- **Closing job:** a scheduled job (GitHub Actions every 10 minutes, like web-ingest, calling a secret-protected
  `/api/bus/close` route) closes trips whose `closes_at` passed: confirmed → capture each booking at the final
  price; not reached → release all holds. Idempotent per booking; failures retried and logged by code only. A
  confirmed trip still receives bookings up to capacity until closing.
- **Tables:** `bus_operators` (licensed company, licence number, contact, payout details reference — no bank data
  stored in clear; owner/admin managed), `operator_members` (who can manage an operator), `organisers` (approved fan
  organisations), `bus_trips` (fixture, club, operator, organiser, pickup points, departure times, vehicle type
  bus/minibus, capacity, min, max price, cost, fees, closes_at, status open/confirmed/cancelled/completed),
  `bus_bookings` (trip, fan, seats ≤ 4, pickup point, hold_ref, authorised, captured, status), `bus_ledger`
  (append-only money lines per trip: captured, operator due, onefan fee, organiser fee, refunds). RLS: fans see open
  trips of their club's fixtures and their own bookings; operators/organisers see their trips' counts and
  passenger names for boarding (no payment data); admins all.
- **Gates:** booking requires `identity` verification (ride verification design), 16–17 allowed only with the
  operator's consent flag on the trip (default off; product note for the lawyer).
- **Cancellations:** before closing a fan can cancel freely (hold released); after confirmation, refund rules per
  the trip's policy text (lawyer). An operator cancelling a confirmed trip → full refund to everyone.
- **Admin and operator screens:** create trip, see fill level and money lines, export passenger list for boarding.
- **Tests:** pgTAP for the formula (price never above max, never rises as n grows), visibility, gates, frozen
  terms, ledger append-only; vitest for the payment adapter (mock) and the closing job logic (reached / not
  reached / partial capture failures).

## Non-goals
Seat maps, private cars, operator self-signup without admin approval, dynamic surge pricing.

## Owner actions
Sign the first operator agreement(s), open the payment processor account (J5), lawyer: platform role, refund and
cancellation policy, consumer protection, minors on buses.
