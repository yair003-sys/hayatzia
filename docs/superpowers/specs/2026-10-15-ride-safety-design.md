# Ride safety pack: design

Status: owner asked 2026-10-15 ("שיהיה אופציה לבחור נהג או נהגת", "העיקר שיהיה מוכן לפני ההשקה; את ה-SMS אני
אסדר"). Must be in place before launch. Phone verification comes later with SMS; this pack is ready for it.

## Why
Rides connect strangers. A sexual assault or other harm during a ride arranged in onefan is a foreseeable risk; the
terms' disclaimer alone is not enough. Fans can register from 16, so minors must not ride with strangers through the app.

## Rules
1. Gender (optional, self-declared) on the profile: אוהד / אוהדת / לא מציין. Shown only in rides. Editable in
   "הכרטיס שלי". Stated plainly in the UI that it is self-declared.
2. Rides are 18+: before offering or requesting a ride the fan confirms once "אני בן/בת 18 ומעלה" (stored with time).
   Enforced in the database for trips and trip requests.
3. Women-only rides: a female driver may mark a ride "לאוהדות בלבד"; only fans whose gender is female can request
   it. Riders can filter "נהגות בלבד". Enforced in the database.
4. Pickup at a public place: the form asks for "נקודת איסוף ציבורית" (train station, stadium parking, a known
   junction) with suggestions and a clear warning not to write a home address.
5. Trust signals on every ride card: how long the driver's account exists, how many rides they completed, their average
   rating (and count). Shown as plain facts, no badges that imply verification.
6. Rating after the ride: once the match is over, accepted riders rate the driver 1–5 once per ride (counter by
   trigger on the driver's ride stats).
7. Share the ride: a button that shares (Web Share, else copy) a text with the driver's nickname, pickup point, time
   and a link, for a friend or parent.
8. Safety screen before the first ride: short tips and emergency numbers — משטרה 100, מרכז הסיוע לנפגעות תקיפה
   מינית 1202, לנפגעים 1203 — acknowledged once (stored).
9. Serious report: a new report reason "הטרדה או פגיעה בנסיעה" on a ride or a fan immediately suspends the reported
   fan from rides only (offering, requesting, open rides hidden) until an admin reviews; admins get a push
   notification. The admin screen can lift it. Normal posting is not affected.
10. Phone verification hook: one database setting "rides require a verified phone" (off for now). When SMS is in
    place, turning it on requires a verified phone for offering and requesting rides.
11. Incident procedure for the owner and the lawyer in docs/: suspend at once, keep all data (no deletion of the
    accounts involved while a case is open: the delete-my-account action refuses during a ride suspension), cooperate
    with the police by law, refer to support (1202/1203).

## Non-goals
ID verification, payments, live location tracking.
