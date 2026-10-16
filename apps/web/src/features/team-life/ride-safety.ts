// Ride safety pack (spec docs/superpowers/specs/2026-10-15-ride-safety-design.md). Pure helpers and copy; the rules
// themselves are enforced by the database (migration 20261015220000_ride_safety).

import { todayIso, yearsBefore } from '@/features/first-run/schema'

/** 18+ for rides, from the birth date (2026-10-16), as the database decides (private.is_adult). */
export type RideAge = 'adult' | 'minor' | 'none'
export function rideAge(birthDate: string | null, today: string = todayIso()): RideAge {
  if (!birthDate) return 'none'
  return birthDate <= yearsBefore(today, 18) ? 'adult' : 'minor'
}
export const RIDES_ADULT_ONLY = 'נסיעות דרך onefan הן מגיל 18 בלבד'
export const RIDES_NEED_BIRTH_DATE = 'כדי לנסוע צריך להשלים תאריך לידה'

/** profiles.gender: self-declared, shown only in rides. */
export const GENDER = { m: 'אוהד', f: 'אוהדת', x: 'לא מציין' } as const
export type Gender = keyof typeof GENDER
export const GENDER_NOTE = 'מוצג רק בנסיעות; זו הצהרה שלך'

export const PICKUP_SUGGESTIONS = ['תחנת רכבת', 'חניון האצטדיון', 'צומת מרכזי'] as const
export const PICKUP_LABEL = 'נקודת איסוף ציבורית'
export const PICKUP_WARNING = 'מקום ציבורי ומוכר. לא כתובת מגורים'
export const WOMEN_ONLY_LABEL = 'לאוהדות בלבד'
export const WOMEN_DRIVERS_FILTER = 'נהגות בלבד'
export const ADULT_CONFIRM = 'אני בן/בת 18 ומעלה'
export const RIDE_SUSPENDED_HE = 'החשבון מושעה מנסיעות עד שהצוות יבדוק דיווח. שאר האפליקציה פועלת כרגיל.'

export const SAFETY_TIPS = [
  'נפגשים רק במקום ציבורי ומואר, לא בבית.',
  'שולחים לחבר או להורה את פרטי הנסיעה (כפתור „שתף את הנסיעה”).',
  'בודקים את הנהג: כמה זמן בחשבון, כמה נסיעות ומה הדירוג.',
  'מרגישים לא בנוח? לא עולים, או מבקשים לרדת במקום ציבורי.',
  'אחרי הנסיעה מדרגים, ואם קרה משהו מדווחים „הטרדה או פגיעה בנסיעה”.',
] as const

/** Shown as text and as tel: links (the number is always visible). */
export const EMERGENCY_NUMBERS = [
  { number: '100', label: 'משטרה' },
  { number: '1202', label: 'מרכז הסיוע לנפגעות תקיפה מינית' },
  { number: '1203', label: 'מרכז הסיוע לנפגעי תקיפה מינית' },
] as const

const plural = (n: number, one: string, two: string, many: (n: number) => string) => (n === 1 ? one : n === 2 ? two : many(n))

/** "בחשבון 3 חודשים": how long the account exists, in plain words. */
export function accountAge(memberSince: string | Date, now: Date = new Date()): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(memberSince).getTime()) / 86_400_000))
  if (days < 1) return 'חשבון חדש מהיום'
  if (days < 30) return `בחשבון ${plural(days, 'יום אחד', 'יומיים', (n) => `${n} ימים`)}`
  if (days < 365) return `בחשבון ${plural(Math.floor(days / 30), 'חודש', 'חודשיים', (n) => `${n} חודשים`)}`
  return `בחשבון ${plural(Math.floor(days / 365), 'שנה', 'שנתיים', (n) => `${n} שנים`)}`
}

export type DriverTrust = {
  memberSince: string
  ridesCompleted: number
  ratingsCount: number
  ratingsSum: number
  female: boolean
}

/** "4.8" (one decimal, no trailing ".0"), or null without ratings. */
export function averageStars(count: number, sum: number): string | null {
  if (count <= 0) return null
  const avg = Math.round((sum / count) * 10) / 10
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
}

/** The trust line on a ride card: "בחשבון 3 חודשים · 4 נסיעות · ★ 4.8 (5)". Plain facts, no verification badge. */
export function trustLine(t: DriverTrust, now: Date = new Date()): string {
  const rides = t.ridesCompleted <= 0 ? 'עוד אין נסיעות' : plural(t.ridesCompleted, 'נסיעה אחת', 'שתי נסיעות', (n) => `${n} נסיעות`)
  const avg = averageStars(t.ratingsCount, t.ratingsSum)
  return [accountAge(t.memberSince, now), rides, avg ? `★ ${avg} (${t.ratingsCount})` : 'עוד בלי דירוג'].join(' · ')
}

const TIME = new Intl.DateTimeFormat('he-IL', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jerusalem',
})

/** The text a fan shares with a friend or parent: driver, pickup point, departure, kickoff and a link. */
export function shareText(p: {
  driverNick: string
  pickup: string
  fromCity: string
  kickoffSec: number
  departBeforeMin: number
  match: string
  url: string
}): string {
  const kickoff = new Date(p.kickoffSec * 1000)
  const depart = new Date(kickoff.getTime() - p.departBeforeMin * 60_000)
  return [
    `נוסע/ת למשחק ${p.match} עם ${p.driverNick} (onefan)`,
    `איסוף: ${p.pickup || p.fromCity}${p.pickup && p.fromCity ? `, ${p.fromCity}` : ''}`,
    `יציאה: ${TIME.format(depart)} · שריקת פתיחה: ${TIME.format(kickoff)}`,
    p.url,
  ].join('\n')
}

/** "נהגות בלבד": ride offers whose driver is a woman. Other filters leave the list as it is. */
export function filterRides<T extends { kind: string; user_id: string }>(
  trips: readonly T[],
  womenDrivers: boolean,
  drivers: Readonly<Record<string, Pick<DriverTrust, 'female'> | undefined>>,
): T[] {
  if (!womenDrivers) return [...trips]
  return trips.filter((t) => t.kind === 'offer' && drivers[t.user_id]?.female === true)
}

const FINAL = new Set(['FT', 'AET', 'PEN'])
/** The match is over (as the database decides for ratings): final status, or 2 hours after kickoff. */
export function rideOver(kickoffIso: string, status: string, now: Date = new Date()): boolean {
  return FINAL.has(status) || new Date(kickoffIso).getTime() + 2 * 3600_000 <= now.getTime()
}

/** The database's ride refusals, in the fan's words (null for anything else). */
export function rideErrorHe(message: string | undefined | null): string | null {
  const m = message ?? ''
  // Since 2026-10-16 18+ comes from the birth date (asked once in the app), not from a tap.
  if (m.includes('no_birth_date')) return 'צריך להשלים תאריך לידה'
  if (m.includes('not_adult')) return RIDES_ADULT_ONLY
  if (m.includes('ride_suspended')) return RIDE_SUSPENDED_HE
  if (m.includes('women_only')) return 'הנסיעה הזאת לאוהדות בלבד'
  if (m.includes('phone_required')) return 'כדי לנסוע צריך לאמת מספר טלפון'
  if (m.includes('ride_started')) return 'המשחק כבר התחיל, ואי אפשר לשנות את הנסיעה'
  if (m.includes('ride_not_over')) return 'אפשר לדרג אחרי המשחק'
  if (m.includes('not_a_rider') || m.includes('not_a_ride')) return 'רק מי שהצטרף לנסיעה יכול לדרג אותה'
  return null
}
