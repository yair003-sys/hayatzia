import { z } from 'zod'

export const REPORT_KINDS = ['team_message', 'match_message', 'clip', 'clip_comment', 'photo', 'photo_comment', 'user', 'dm_thread'] as const
export const REPORT_REASONS = ['הטרדה', 'גזענות או שנאה', 'אלימות', 'תוכן מיני', 'ספאם', 'התחזות', 'פריט מזויף / מכירת כרטיסים', 'אחר'] as const

export const reportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  ref: z.string().min(1).max(100),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(120).default(''),
})
export const blockSchema = z.object({ userId: z.uuid(), on: z.boolean() })
