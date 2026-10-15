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

export const REPORT_REASONS = ['הטרדה', 'גזענות או שנאה', 'אלימות', 'תוכן מיני', 'ספאם', 'התחזות', 'פריט מזויף / מכירת כרטיסים', 'אחר'] as const

export const reportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  ref: z.string().min(1).max(100),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(120).default(''),
})
export const blockSchema = z.object({ userId: z.uuid(), on: z.boolean() })

/** "צור קשר" in "הכרטיס שלי": a request with no target (privacy, accessibility, anything else). */
export const CONTACT_TOPICS = ['פרטיות', 'נגישות', 'אחר'] as const
export const CONTACT_MAX = 500
export const contactSchema = z.object({
  topic: z.enum(CONTACT_TOPICS),
  text: z.string().trim().min(2, { error: 'כתוב כמה מילים על הבקשה' }).max(CONTACT_MAX, { error: `עד ${CONTACT_MAX} תווים` }),
})
