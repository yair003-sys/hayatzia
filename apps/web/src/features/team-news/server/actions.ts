'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { moderationHe } from '@/lib/moderation'
import {
  commentCursorSchema,
  commentSchema,
  createPostSchema,
  editPostSchema,
  postCursorSchema,
  postIdSchema,
  reactPostSchema,
  type CommentResult,
  type PostResult,
} from '../schema'
import { getPostById, getPostComments, getTeamNews } from './queries'
import { notifyNewPost } from './notify'

const UNAVAILABLE = 'הערוץ לא זמין בסביבה הזאת'

/** Publish a post (channel admins only — enforced by RLS). Only content is sent; club/author/time are stamped. */
export const createPostAction = actionClient.inputSchema(createPostSchema).action(async ({ parsedInput }): Promise<PostResult> => {
  const supabase = await createClient()
  if (!supabase) return { error: UNAVAILABLE }
  const ins = await supabase
    .from('channel_posts')
    .insert({
      title: parsedInput.title?.trim() || null,
      body: parsedInput.body,
      media_path: parsedInput.mediaPath ?? null,
      media_kind: parsedInput.mediaKind ?? null,
    })
    .select('id,team_id')
    .single()
  if (ins.error) {
    if (parsedInput.mediaPath) await supabase.storage.from('channel').remove([parsedInput.mediaPath])
    return { error: moderationHe(ins.error.message) ?? 'הפוסט לא פורסם' }
  }
  const post = await getPostById(ins.data.id)
  if (!post) return { error: 'הפוסט לא פורסם' }
  void notifyNewPost(ins.data.team_id, { title: post.title, body: post.body })
  return { post }
})

/** Edit a post's title/body (the posting admin / any admin of the club — RLS). */
export const editPostAction = actionClient.inputSchema(editPostSchema).action(async ({ parsedInput }): Promise<PostResult> => {
  const supabase = await createClient()
  if (!supabase) return { error: UNAVAILABLE }
  const upd = await supabase
    .from('channel_posts')
    .update({ title: parsedInput.title?.trim() || null, body: parsedInput.body })
    .eq('id', parsedInput.postId)
    .select('id')
  if (upd.error) return { error: moderationHe(upd.error.message) ?? 'לא נשמר' }
  const post = await getPostById(parsedInput.postId)
  return post ? { post } : { error: 'לא נשמר' }
})

export const deletePostAction = actionClient.inputSchema(postIdSchema).action(async ({ parsedInput: { postId } }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const }
  const { error } = await supabase.from('channel_posts').delete().eq('id', postId)
  return { ok: !error }
})

/** One reaction per fan per post (emoji null = remove). Same shape as the chat reaction action. */
export const reactPostAction = actionClient.inputSchema(reactPostSchema).action(async ({ parsedInput: { postId, emoji } }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const }
  if (emoji === null) {
    const { error } = await supabase.from('channel_post_reactions').delete().eq('post_id', postId)
    return { ok: !error }
  }
  const upd = await supabase.from('channel_post_reactions').update({ emoji }).eq('post_id', postId).select('post_id')
  if (upd.error) return { ok: false as const }
  if ((upd.data?.length ?? 0) === 0) {
    const ins = await supabase.from('channel_post_reactions').insert({ post_id: postId, emoji })
    if (ins.error) return { ok: false as const }
  }
  return { ok: true as const }
})

/** Comment on a post (same-club fans; the DB stamps club/nick/time, moderates, and rate-limits 5/10s). */
export const commentPostAction = actionClient.inputSchema(commentSchema).action(async ({ parsedInput }): Promise<CommentResult> => {
  const supabase = await createClient()
  if (!supabase) return { error: UNAVAILABLE }
  const { data, error } = await supabase
    .from('channel_post_comments')
    .insert({ post_id: parsedInput.postId, body: parsedInput.body })
    .select('id,user_id,nick,body,created_at')
    .single()
  if (error) return { error: moderationHe(error.message) ?? 'התגובה לא נשלחה' }
  return { comment: { id: data.id, userId: data.user_id, nick: data.nick, body: data.body, createdAt: data.created_at } }
})

export const markPostViewedAction = actionClient.inputSchema(postIdSchema).action(async ({ parsedInput: { postId } }) => {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const }
  const { error } = await supabase.from('channel_post_views').insert({ post_id: postId })
  // 23505 = already viewed by me; that is success for a unique view.
  return { ok: !error || error.code === '23505' }
})

export const markNewsSeenAction = actionClient.inputSchema(z.object({})).action(async () => {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const }
  const { error } = await supabase.rpc('channel_mark_seen')
  return { ok: !error }
})

/** Fetch one post (used when a realtime INSERT tells the feed a post was published). */
export const loadPostAction = actionClient
  .inputSchema(postIdSchema)
  .action(async ({ parsedInput: { postId } }) => ({ post: await getPostById(postId) }))

export const loadOlderNewsAction = actionClient
  .inputSchema(postCursorSchema)
  .action(async ({ parsedInput }) => ({ posts: await getTeamNews(parsedInput) }))

export const loadCommentsAction = actionClient
  .inputSchema(postIdSchema)
  .action(async ({ parsedInput: { postId } }) => ({ comments: await getPostComments(postId) }))

export const loadOlderCommentsAction = actionClient
  .inputSchema(commentCursorSchema)
  .action(async ({ parsedInput }) => ({ comments: await getPostComments(parsedInput.postId, parsedInput.cursor) }))
