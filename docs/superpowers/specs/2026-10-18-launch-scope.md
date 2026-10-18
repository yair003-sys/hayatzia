# Launch scope: hide features behind flags (2026-10-18)

## Why
The app has ~25 feature areas but zero real fans. For launch we show one clear daily loop and hide the
rest until a community is live, then turn them on one at a time. Nothing is deleted — every feature stays
built, tested and in the database, only hidden from fans.

Owner's decision (2026-10-18): private messages, groups and crowd-war stay **on**; rides/trips, market and
events go **off** for launch.

## Daily loop (what launch keeps)
יש משחק → נכנסים ליציע: רואים אותו חי עם כל הקהל, צועקים בצ'אט, ואחרי המשחק מדרגים את השחקנים ומעלים לכיכר.

On at launch: onboarding, home, club chat, live scores + goal notifications, crowd verdict, Square,
ratings + player of the match + check-in, predictions, fan card/profile, push, admin + reports + safety,
legal, PWA, **private messages + groups**, **crowd-war**, chants, sample XI.

## What goes off (this change)
Three env flags, each off by default, switched on later in Vercel with no code change:

- `NEXT_PUBLIC_FEATURE_RIDES` — trips page + stand tile, and the identity verification (`/me/verify`,
  its demo) and gender setting that exist only for rides.
- `NEXT_PUBLIC_FEATURE_MARKET` — fans' market.
- `NEXT_PUBLIC_FEATURE_EVENTS` — events board.

## How
- `src/lib/flags.ts` reads the three env vars (single source, same value server + client).
- Discovery is hidden: the stand home (`stand/page.tsx`) and "my card" (`me/page.tsx`) only render a hidden
  area's link/tile when its flag is on.
- Direct access is blocked: each page (`stand/trips`, `stand/events`, `stand/market`, `me/verify`,
  `me/verify/demo`) calls `notFound()` when its flag is off.
- Leftover deep links (notification URLs, activity hrefs, revalidatePath) are untouched: with the feature
  off no new such activity is created, and any stale link lands on the 404 guard.

## Verification
- Unit test: `src/lib/flags.test.ts` (defaults off; on only for exact `'on'`; independent).
- CI green (typecheck, lint, unit, build, Playwright smoke).
- Phone check at 375px (owner's rule) on home/chat/Square/inbox/my card/trips before merge: no overflow
  bar, `scrollWidth == clientWidth`, and the hidden tiles/links are gone.

## Turning a feature back on
Set its env var to `on` in Vercel (Production) and redeploy. Each switch-on is a fan-facing "what's new".
