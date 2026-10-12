import { z } from 'zod'

export const FEED_SIZE = 20
export const MAX_UPLOAD_MB = 50
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm'

export type ClipKind = 'image' | 'video'
export type Audience = 'all' | 'team'
const audience = z.enum(['all', 'team'])

export type Clip = {
  id: string
  user_id: string
  team_id: string
  nick: string
  kind: ClipKind
  caption: string
  tags: string
  once: boolean
  likes_count: number
  respects_count: number
  comments_count: number
  views_count: number
  created_at: string
  expires_at: string
  /** 'all' = the whole league, 'team' = only the poster's club. */
  audience: Audience
  /** Signed URL (null for view-once posts until the fan opens them). */
  url: string | null
  liked: boolean
  respected: boolean
  /** Shown at once from the phone while the upload finishes in the background. */
  uploading?: boolean
}

export type ClipComment = { id: string; user_id: string; team_id: string; nick: string; body: string; created_at: string }

export const clipIdSchema = z.object({ clipId: z.uuid() })
export const toggleSchema = clipIdSchema.extend({ on: z.boolean() })
export const commentSchema = clipIdSchema.extend({
  body: z.string().trim().min(1, 'התגובה ריקה').max(150, 'עד 150 תווים'),
})
export const createClipSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$/, 'קובץ לא תקין'),
  kind: z.enum(['image', 'video']),
  caption: z.string().trim().max(120, 'עד 120 תווים').default(''),
  tags: z.string().trim().max(60, 'עד 60 תווים').default(''),
  once: z.boolean().default(false),
  audience: audience.default('all'),
})
export const feedCursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  audience: audience.default('all'),
})

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

/** File type → { kind, ext } for the upload, or null when the file is not allowed. */
export function mediaOf(mime: string): { kind: ClipKind; ext: string } | null {
  const ext = EXT[mime]
  if (!ext) return null
  return { kind: mime.startsWith('video/') ? 'video' : 'image', ext }
}

/** "עוד 5 שע׳" / "עוד 12 דק׳" / "נעלם" for a post's expiry. */
export function timeLeftHe(expiresAt: string, nowMs: number): string {
  const min = Math.floor((new Date(expiresAt).getTime() - nowMs) / 60_000)
  if (min <= 0) return 'נעלם'
  if (min < 60) return `עוד ${min} דק׳`
  return `עוד ${Math.floor(min / 60)} שע׳`
}

/** 1234 → "1.2K" (same short counts as the legacy app). */
export function shortCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${Math.floor(n / 1000)}K`
}

export const SHRINK_MAX_PX = 1600

/** Width and height that fit the long side into `max` pixels, keeping the shape (never enlarges). */
export function fitWithin(width: number, height: number, max = SHRINK_MAX_PX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Still photos are shrunk before upload; videos and (possibly animated) GIFs go as they are. */
export function shouldShrink(mime: string): boolean {
  return mime.startsWith('image/') && mime !== 'image/gif'
}
