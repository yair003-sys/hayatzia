import { z } from 'zod'
import { isRideHarm, type ReportKind } from '@/features/safety/schema'

/** The three tabs of /admin/reports (reports.status). */
export const QUEUE_STATUS = { open: 'פתוחים', handled: 'טופלו', dismissed: 'נדחו' } as const
export type QueueStatus = keyof typeof QUEUE_STATUS
export const QUEUE_PAGE = 30

export function queueStatus(v: unknown): QueueStatus {
  return typeof v === 'string' && v in QUEUE_STATUS ? (v as QueueStatus) : 'open'
}

/** What was reported, in Hebrew (one label per reports.kind). */
export const KIND_LABEL: Record<ReportKind, string> = {
  team_message: 'הודעה בצ׳אט הקבוצה',
  match_message: 'הודעה בחדר המשחק',
  clip: 'פוסט בכיכר',
  clip_comment: 'תגובה בכיכר',
  photo: 'תמונה ביציע',
  photo_comment: 'תגובה לתמונה',
  user: 'אוהד',
  dm_thread: 'שיחה פרטית',
  market_item: 'מודעה בשוק',
  trip: 'נסיעה למשחק',
  event: 'אירוע אוהדים',
  chant: 'שיר',
  review: 'ביקורת על שחקן',
  contact: 'פנייה (צור קשר)',
}

export function kindLabel(kind: string): string {
  return kind in KIND_LABEL ? KIND_LABEL[kind as ReportKind] : kind
}

/** Kinds the admin can remove (a row with content). A fan is suspended, a private conversation is never opened. */
export const REMOVABLE_KINDS = [
  'team_message',
  'match_message',
  'clip',
  'clip_comment',
  'photo',
  'photo_comment',
  'review',
  'market_item',
  'trip',
  'event',
  'chant',
] as const satisfies readonly ReportKind[]

export function isRemovable(kind: string): kind is (typeof REMOVABLE_KINDS)[number] {
  return (REMOVABLE_KINDS as readonly string[]).includes(kind)
}

/** Storage buckets a removed row can hold a file in (migration 20261015180000: clips, stand, market, chants). */
export const CONTENT_BUCKETS = ['clips', 'stand', 'market', 'chants'] as const

/** The file to delete after a removal, or null. Only a known bucket and a plain path inside it are accepted. */
export function fileToRemove(bucket: string | null | undefined, path: string | null | undefined): { bucket: string; path: string } | null {
  if (!bucket || !path) return null
  if (!(CONTENT_BUCKETS as readonly string[]).includes(bucket)) return null
  if (path.startsWith('/') || path.split('/').includes('..')) return null
  return { bucket, path }
}

/** Badge on a report whose content the database hid after many reports (migration 20261015200000_auto_hide). */
export const AUTO_HIDDEN_LABEL = 'הוסתר אוטומטית'

/** The audit trail's actions (admin_actions.action), in Hebrew. */
export const ACTION_LABEL: Record<string, string> = {
  remove: 'הסרת תוכן',
  ban: 'השעיה',
  unban: 'ביטול השעיה',
  status: 'שינוי סטטוס',
  auto_hide: AUTO_HIDDEN_LABEL,
  restore: 'החזרת תוכן',
  ride_suspend: 'השעיה מנסיעות',
  ride_unsuspend: 'ביטול השעיה מנסיעות',
  verify_reset: 'איפוס ניסיונות אימות',
  birth_date_fix: 'תיקון תאריך לידה',
  incident_ack: 'קבלת אירוע חירום',
  incident_close: 'סגירת אירוע חירום',
}

/** The red label on a harm-in-a-ride report (ride safety, rule 9). */
export const RIDE_URGENT_LABEL = 'דחוף · נסיעה'
export function isUrgentRide(r: { kind: string; reason: string }): boolean {
  return isRideHarm(r.kind, r.reason)
}

export function actionLabel(action: string): string {
  return Object.hasOwn(ACTION_LABEL, action) ? (ACTION_LABEL[action] ?? action) : action
}

/** Who did it, for the audit trail: the admin's nickname, or "אוטומטי" for the database's own auto-hide. */
export function actionBy(action: string, adminNick: string | null | undefined): string | null {
  if (adminNick) return adminNick
  return action === 'auto_hide' || action === 'ride_suspend' ? 'אוטומטי' : null
}

export function reportsOnTarget(n: number): string {
  return n === 1 ? 'דיווח אחד על התוכן הזה' : `${n} דיווחים על התוכן הזה`
}

const TIME = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
/** "15.10, 14:05" in Israel time. */
export function reportTime(iso: string): string {
  return TIME.format(new Date(iso))
}

/** "עד 22.10, 14:05" or "לצמיתות". */
export function banUntilLabel(until: string | null): string {
  return until ? `עד ${reportTime(until)}` : 'לצמיתות'
}

/** Hebrew for the errors the admin functions raise. */
export function adminErrorHe(message: string | undefined | null): string {
  const m = message ?? ''
  if (m.includes('not_admin')) return 'אין לך הרשאה לפעולה הזאת'
  if (m.includes('cannot_ban_admin')) return 'אי אפשר להשעות מנהל'
  if (m.includes('bad_kind')) return 'את התוכן הזה אי אפשר להסיר מכאן'
  if (m.includes('no_report')) return 'הדיווח לא נמצא'
  if (m.includes('too_young') || m.includes('bad_date')) return 'תאריך הלידה לא תקין (גיל 16 ומעלה, לא בעתיד)'
  if (m.includes('no_profile')) return 'האוהד לא נמצא'
  return 'הפעולה נכשלה. נסה שוב'
}

export const BAN_DAYS = 7

export const removeSchema = z.object({ kind: z.enum(REMOVABLE_KINDS), ref: z.string().min(1).max(100) })
/** Putting hidden content back: the same kinds as removal (rows with content). */
export const restoreSchema = removeSchema
export const banSchema = z.object({
  userId: z.uuid(),
  days: z.union([z.literal(BAN_DAYS), z.null()]),
  reason: z.string().trim().max(120).default(''),
})
export const unbanSchema = z.object({ userId: z.uuid() })
export const liftRideSchema = z.object({ userId: z.uuid() })
// Ride verification and emergencies (migration 20261016200000_ride_verification).
export const resetVerificationSchema = z.object({ userId: z.uuid(), kind: z.enum(['identity', 'licence']) })
export const fixBirthDateSchema = z.object({ userId: z.uuid(), birthDate: z.iso.date() })
export const incidentSchema = z.object({ id: z.uuid() })
export const INCIDENTS_NOTE = 'onefan אינה מוקד חירום 24/7. אם מישהו בסכנה עכשיו, אומרים לו לחייג 100 (משטרה). כאן רואים מי, מאיפה, מתי ואיזה רכב.'
export const statusSchema = z.object({ reportId: z.uuid(), status: z.enum(['open', 'handled', 'dismissed']) })
