import { z } from 'zod'

export const PHOTOS_PAGE = 24
export const PHOTO_MAX_MB = 15
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
export const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export type StandPhoto = {
  id: string
  user_id: string
  nick: string
  caption: string
  likes_count: number
  comments_count: number
  created_at: string
  url: string | null
  liked: boolean
}
export type PhotoComment = { id: string; user_id: string; nick: string; body: string; created_at: string }

export const photoIdSchema = z.object({ photoId: z.uuid() })
export const photoLikeSchema = photoIdSchema.extend({ on: z.boolean() })
export const photoCommentSchema = photoIdSchema.extend({ body: z.string().trim().min(1).max(120, 'עד 120 תווים') })
export const createPhotoSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/, 'קובץ לא תקין'),
  caption: z.string().trim().max(120, 'עד 120 תווים').default(''),
})
export const photosCursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
