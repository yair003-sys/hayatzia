import { z } from 'zod'
// The channel reuses the chat's emoji reaction model (shipped) — same sets, same totals helper.
export { POPULAR_REACTIONS, MORE_REACTIONS, QUICK_LIKE, totalReactions } from '@/features/chat/schema'
import { cursorSchema, type Cursor } from '@/features/chat/schema'

export { cursorSchema }
export type { Cursor }

export const POST_BODY_MAX = 1000
export const POST_TITLE_MAX = 80
export const COMMENT_MAX = 500
export const PAGE_SIZE = 50

/** A media file already uploaded to the public `channel` bucket: `<uid>/<uuid>.<ext>` (same shape as clips). */
const mediaPathRe = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$/

export const createPostSchema = z.object({
  title: z.string().trim().max(POST_TITLE_MAX, `עד ${POST_TITLE_MAX} תווים`).optional(),
  body: z.string().trim().min(1, 'אין טקסט לפוסט').max(POST_BODY_MAX, `עד ${POST_BODY_MAX} תווים`),
  mediaPath: z.string().regex(mediaPathRe, 'קובץ לא תקין').optional(),
  mediaKind: z.enum(['image', 'video']).optional(),
})

export const editPostSchema = z.object({
  postId: z.uuid(),
  title: z.string().trim().max(POST_TITLE_MAX).optional(),
  body: z.string().trim().min(1, 'אין טקסט לפוסט').max(POST_BODY_MAX),
})

export const commentSchema = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1, 'התגובה ריקה').max(COMMENT_MAX, `עד ${COMMENT_MAX} תווים`),
})

/** emoji null = remove my reaction. */
export const reactPostSchema = z.object({ postId: z.uuid(), emoji: z.string().min(1).max(32).nullable() })
export const postIdSchema = z.object({ postId: z.uuid() })
export const postCursorSchema = cursorSchema
export const commentCursorSchema = z.object({ postId: z.uuid(), cursor: cursorSchema })

export type NewsPost = {
  id: string
  authorId: string
  authorNick: string
  title: string | null
  body: string
  mediaUrl: string | null
  mediaKind: 'image' | 'video' | null
  views: number
  reactions: Record<string, number>
  myReaction: string | null
  comments: number
  createdAt: string
  editedAt: string | null
}

export type NewsComment = {
  id: string
  userId: string
  nick: string
  body: string
  createdAt: string
}

/** The "INSERT" broadcast on news:<club> carries only the post id (posts are infrequent; the client fetches it). */
export function postIdFromBroadcast(payload: unknown): string | null {
  const p = payload as { post_id?: unknown } | null
  if (!p || typeof p.post_id !== 'string') return null
  return p.post_id
}

/** The "REACTION" broadcast on news:<club> = {post_id, reactions}, or null when the shape is off. */
export function reactionFromBroadcast(payload: unknown): { id: string; reactions: Record<string, number> } | null {
  const p = payload as { post_id?: unknown; reactions?: unknown } | null
  if (!p || typeof p.post_id !== 'string' || typeof p.reactions !== 'object' || p.reactions === null) return null
  const reactions: Record<string, number> = {}
  for (const [emoji, count] of Object.entries(p.reactions as Record<string, unknown>)) {
    if (typeof count === 'number' && count > 0) reactions[emoji] = count
  }
  return { id: p.post_id, reactions }
}

/** The "COMMENT" broadcast on newspost:<postId>, or null when the shape is off. */
export function commentFromBroadcast(payload: unknown): NewsComment | null {
  const p = payload as Record<string, unknown> | null
  if (!p || typeof p.id !== 'string' || typeof p.user_id !== 'string' || typeof p.body !== 'string') return null
  return {
    id: p.id,
    userId: p.user_id,
    nick: typeof p.nick === 'string' ? p.nick : '',
    body: p.body,
    createdAt: typeof p.created_at === 'string' ? p.created_at : new Date().toISOString(),
  }
}

export type PostResult = { post: NewsPost } | { error: string }
export type CommentResult = { comment: NewsComment } | { error: string }
