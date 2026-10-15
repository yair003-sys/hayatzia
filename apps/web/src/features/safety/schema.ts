import { z } from 'zod'

/** What a report can point at (reports.kind; migration 20261015180000_moderation_admin). 'contact' is filed by contactSchema. */
export const REPORT_KINDS = [
  'team_message',
  'match_message',
  'clip',
  'clip_comment',
  'photo',
  'photo_comment',
  'user',
  'dm_thread',
  'market_item',
  'trip',
  'event',
  'chant',
  'review',
] as const
export type ReportKind = (typeof REPORT_KINDS)[number] | 'contact'

/**
 * Harm during a ride (ride safety, rule 9): on a ride or a fan it suspends the reported fan from rides at once, until an
 * admin reviews (migration 20261015220000_ride_safety, private.ride_harm_reason()), and the admins get a push.
 */
export const RIDE_HARM_REASON = 'הטרדה או פגיעה בנסיעה'
export const RIDE_HARM_KINDS = ['trip', 'user'] as const

export const REPORT_REASONS = [
  'הטרדה',
  'גזענות או שנאה',
  'אלימות',
  'תוכן מיני',
  'ספאם',
  'התחזות',
  'פריט מזויף / מכירת כרטיסים',
  RIDE_HARM_REASON,
  'אחר',
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** True for a harm-in-a-ride report (on a ride or a fan). */
export function isRideHarm(kind: string, reason: string): boolean {
  return reason === RIDE_HARM_REASON && (RIDE_HARM_KINDS as readonly string[]).includes(kind)
}

/**
 * The reasons offered for a kind: the ride-harm one right after "הטרדה" on rides and fans, and nowhere else. It is never
 * the default (it suspends someone at once), so the form opens on "הטרדה" as before.
 */
export function reasonsFor(kind: string): ReportReason[] {
  const others = REPORT_REASONS.filter((r) => r !== RIDE_HARM_REASON)
  if (!(RIDE_HARM_KINDS as readonly string[]).includes(kind)) return others
  return [others[0]!, RIDE_HARM_REASON, ...others.slice(1)]
}

/** Shown after a ride-harm report is sent. */
export const RIDE_HARM_SENT_HE = 'הדיווח הגיע לצוות כדחוף ונבדק מיד. בחירום: משטרה 100 · מרכז הסיוע 1202 / 1203.'
/** Shown under the reason when it is chosen. */
export const RIDE_HARM_HINT_HE = 'האוהד יושעה מנסיעות מיד, עד שהצוות יבדוק. בחירום התקשרו למשטרה 100.'

export const reportSchema = z
  .object({
    kind: z.enum(REPORT_KINDS),
    ref: z.string().min(1).max(100),
    reason: z.enum(REPORT_REASONS),
    note: z.string().trim().max(120).default(''),
  })
  .refine((r) => r.reason !== RIDE_HARM_REASON || isRideHarm(r.kind, r.reason), { error: 'הסיבה הזאת היא לנסיעות ולאוהדים בלבד' })
export const blockSchema = z.object({ userId: z.uuid(), on: z.boolean() })

/** "צור קשר" in "הכרטיס שלי": a request with no target (privacy, accessibility, anything else). */
export const CONTACT_TOPICS = ['פרטיות', 'נגישות', 'אחר'] as const
export const CONTACT_MAX = 500
/** Shown after a request is sent, and kept on screen (owner, 2026-10-15). No e-mail is sent by the app. */
export const CONTACT_ACK_HE = 'קיבלנו את הפנייה. נחזור אליך תוך 48 שעות לכתובת המייל של החשבון.'
export const contactSchema = z.object({
  topic: z.enum(CONTACT_TOPICS),
  text: z.string().trim().min(2, { error: 'כתוב כמה מילים על הבקשה' }).max(CONTACT_MAX, { error: `עד ${CONTACT_MAX} תווים` }),
})
