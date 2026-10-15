import { z } from 'zod'
import type { ReportKind } from '@/features/safety/schema'

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
  return 'הפעולה נכשלה. נסה שוב'
}

export const BAN_DAYS = 7

export const removeSchema = z.object({ kind: z.enum(REMOVABLE_KINDS), ref: z.string().min(1).max(100) })
export const banSchema = z.object({
  userId: z.uuid(),
  days: z.union([z.literal(BAN_DAYS), z.null()]),
  reason: z.string().trim().max(120).default(''),
})
export const unbanSchema = z.object({ userId: z.uuid() })
export const statusSchema = z.object({ reportId: z.uuid(), status: z.enum(['open', 'handled', 'dismissed']) })
