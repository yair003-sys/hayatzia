import { z } from 'zod'

export const TRIP_KIND = { offer: 'מציע טרמפ', seek: 'מחפש טרמפ', meet: 'מחפש חברים לדרך' } as const
export const EVENT_KIND = {
  screen: { e: '📺', t: 'הקרנה משותפת' },
  march: { e: '🥁', t: 'צעדה' },
  charity: { e: '🤝', t: 'התרמה' },
  meet: { e: '🍻', t: 'מפגש' },
  other: { e: '📣', t: 'אחר' },
} as const
export const MARKET_CAT = { shirt: 'חולצות', scarf: 'צעיפים', flag: 'דגלים', memo: 'מזכרות', other: 'אחר' } as const
export const CONDITION = { new: 'חדש', like_new: 'כמו חדש', used: 'משומש' } as const

/** Shown on the create forms (terms of use, 2026-10-15). */
export const RIDE_DISCLAIMER = 'נסיעה משותפת בין אוהדים, חלוקת דלק בלבד, באחריות המשתתפים. onefan אינה צד לנסיעה.'
export const MARKET_DISCLAIMER = 'אסור למכור כרטיסים למשחקים ומוצרים מזויפים. העסקה בין האוהדים בלבד, ו-onefan אינה צד לה.'

const kinds = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export const tripSchema = z.object({
  fixtureId: z.number().int().positive(),
  kind: z.enum(kinds(TRIP_KIND)),
  fromCity: z.string().trim().min(2, 'מאיפה יוצאים?').max(40),
  // A public place (train station, stadium parking, a known junction), never a home address (ride safety, rule 4).
  pickup: z.string().trim().min(3, 'איפה נפגשים? מקום ציבורי').max(80),
  womenOnly: z.boolean().default(false),
  departBeforeMin: z.number().int().min(15).max(600),
  seats: z.number().int().min(0).max(8),
  cost: z.enum(['share', 'free']),
  note: z.string().trim().max(140).default(''),
})
export const idSchema = z.object({ id: z.uuid() })
/** The one-time 18+ confirmation and safety screen before the first ride. */
export const rideConsentSchema = z.strictObject({ adult: z.literal(true) })
export const genderSchema = z.strictObject({ gender: z.enum(['m', 'f', 'x']) })
export const rateRideSchema = z.strictObject({ tripId: z.uuid(), stars: z.number().int().min(1).max(5) })
export const decideSchema = z.object({ tripId: z.uuid(), userId: z.uuid(), accept: z.boolean() })
export const eventSchema = z.object({
  kind: z.enum(kinds(EVENT_KIND)),
  title: z.string().trim().min(3, 'כותרת קצרה מדי').max(80),
  startsAt: z.iso.datetime({ offset: true }),
  area: z.string().trim().min(2, 'איפה?').max(80),
  note: z.string().trim().max(200).default(''),
})
export const goingSchema = idSchema.extend({ on: z.boolean() })
export const itemSchema = z.object({
  category: z.enum(kinds(MARKET_CAT)),
  title: z
    .string()
    .trim()
    .min(2, 'מה מוכרים?')
    .max(40)
    .refine((t) => !/(כרטיס|ticket)/i.test(t), 'בשוק לא מוכרים כרטיסים'),
  size: z.string().trim().max(10).default(''),
  condition: z.enum(kinds(CONDITION)),
  price: z.number().int().min(0).max(100000),
  path: z
    .string()
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/)
    .nullable()
    .default(null),
})

/** Departure time label: kick-off minus minutes, e.g. "17:30". */
export function departureLabel(kickoffSec: number, beforeMin: number): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(
    new Date(kickoffSec * 1000 - beforeMin * 60_000),
  )
}
