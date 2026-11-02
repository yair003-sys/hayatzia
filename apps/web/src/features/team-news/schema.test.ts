import { describe, expect, it } from 'vitest'
import {
  createPostSchema,
  reactPostSchema,
  postIdFromBroadcast,
  reactionFromBroadcast,
  commentFromBroadcast,
} from './schema'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('broadcast parsers', () => {
  it('postIdFromBroadcast reads the post id, or null on garbage', () => {
    expect(postIdFromBroadcast({ post_id: UUID })).toBe(UUID)
    expect(postIdFromBroadcast({})).toBeNull()
    expect(postIdFromBroadcast(null)).toBeNull()
  })

  it('reactionFromBroadcast reads {post_id, reactions}, or null on garbage', () => {
    expect(reactionFromBroadcast({ post_id: UUID, reactions: { '❤️': 2 } })).toEqual({ id: UUID, reactions: { '❤️': 2 } })
    expect(reactionFromBroadcast({ post_id: UUID })).toBeNull()
    expect(reactionFromBroadcast({})).toBeNull()
  })

  it('commentFromBroadcast reads a comment, or null when the body is missing', () => {
    const c = commentFromBroadcast({ id: UUID, user_id: UUID, nick: 'דני', body: 'יאללה', created_at: '2026-11-01T10:00:00+00:00' })
    expect(c?.body).toBe('יאללה')
    expect(commentFromBroadcast({ id: UUID, user_id: UUID })).toBeNull()
  })
})

describe('createPostSchema', () => {
  it('rejects an empty body', () => {
    expect(createPostSchema.safeParse({ body: '   ' }).success).toBe(false)
  })
  it('rejects a body over the limit', () => {
    expect(createPostSchema.safeParse({ body: 'x'.repeat(1001) }).success).toBe(false)
  })
  it('rejects a title over the limit', () => {
    expect(createPostSchema.safeParse({ title: 'x'.repeat(81), body: 'שלום' }).success).toBe(false)
  })
  it('rejects a malformed media path', () => {
    expect(createPostSchema.safeParse({ body: 'שלום', mediaPath: 'not/a/path.exe' }).success).toBe(false)
  })
  it('accepts a valid post', () => {
    expect(createPostSchema.safeParse({ title: 'ניצחון', body: 'שבת אלופים' }).success).toBe(true)
  })
})

describe('reactPostSchema', () => {
  it('accepts a null emoji (remove my reaction)', () => {
    expect(reactPostSchema.safeParse({ postId: UUID, emoji: null }).success).toBe(true)
  })
})
