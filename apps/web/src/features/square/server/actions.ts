'use server'

import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe } from '@/features/chat/schema'
import { moderationHe } from '@/lib/moderation'
import { clipIdSchema, commentSchema, createClipSchema, feedCursorSchema, toggleSchema } from '../schema'
import { getClip, getClipComments, getSquareFeed } from './queries'

const ONCE_URL_TTL = 120 // seconds: enough to watch, not to share

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** Called after the browser uploaded the file to Storage. The database stamps club, nickname and the 24h expiry. */
export const createClipAction = actionClient.inputSchema(createClipSchema).action(async ({ parsedInput }) => {
  const supabase = await db()
  const { data: row, error } = await supabase
    .from('clips')
    .insert({
    media_path: parsedInput.path,
    kind: parsedInput.kind,
    caption: parsedInput.caption,
    tags: parsedInput.tags,
    once: parsedInput.once,
    audience: parsedInput.audience,
  })
    .select('id')
    .single()
  if (error) {
    await supabase.storage.from('clips').remove([parsedInput.path])
    return {
      error:
        moderationHe(error.message) ??
        (error.message.includes('rate_limit') ? 'הגעת למקסימום העלאות לשעה. נסה מאוחר יותר' : 'הפרסום נכשל. נסה שוב'),
    }
  }
  // The poster's feed adds the post itself (no page reload); other fans see it on their next load.
  return { ok: true as const, clip: await getClip(row.id) }
})

export const toggleLikeAction = actionClient.inputSchema(toggleSchema).action(async ({ parsedInput: { clipId, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('clip_likes').insert({ clip_id: clipId })
    : await supabase.from('clip_likes').delete().eq('clip_id', clipId)
  return error && error.code !== '23505' ? { error: 'לא הצלחנו לשמור' } : { ok: true as const }
})

export const toggleRespectAction = actionClient.inputSchema(toggleSchema).action(async ({ parsedInput: { clipId, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('clip_respects').insert({ clip_id: clipId })
    : await supabase.from('clip_respects').delete().eq('clip_id', clipId)
  return error && error.code !== '23505' ? { error: 'כבוד נותנים רק לאוהדים של קבוצה אחרת' } : { ok: true as const }
})

/**
 * View-once: the fan's view is recorded first (one per fan, so a second or parallel call fails), then the server signs
 * a short link. A view-once file is never readable by fans directly (storage rule), so this is the only way in.
 */
export const openOnceClipAction = actionClient.inputSchema(clipIdSchema).action(async ({ parsedInput: { clipId } }) => {
  const supabase = await db()
  const { data: clip } = await supabase.from('clips').select('media_path,once').eq('id', clipId).maybeSingle()
  if (!clip || !clip.once) return { error: 'הפוסט כבר נצפה או נעלם' }
  const { error: viewErr } = await supabase.from('clip_views').insert({ clip_id: clipId })
  if (viewErr) return { error: 'הפוסט כבר נצפה או נעלם' }
  const admin = createAdminClient()
  const { data: signed } = admin ? await admin.storage.from('clips').createSignedUrl(clip.media_path, ONCE_URL_TTL) : { data: null }
  if (!signed) return { error: 'לא הצלחנו לפתוח' }
  return { url: signed.signedUrl }
})

export const deleteClipAction = actionClient.inputSchema(clipIdSchema).action(async ({ parsedInput: { clipId } }) => {
  const supabase = await db()
  const { data: clip } = await supabase.from('clips').select('media_path').eq('id', clipId).maybeSingle()
  if (!clip) return { error: 'הפוסט לא נמצא' }
  const { error } = await supabase.from('clips').delete().eq('id', clipId)
  if (error) return { error: 'המחיקה נכשלה' }
  await supabase.storage.from('clips').remove([clip.media_path])
  return { ok: true as const }
})

export const getCommentsAction = actionClient
  .inputSchema(clipIdSchema)
  .action(async ({ parsedInput: { clipId } }) => ({ comments: await getClipComments(clipId) }))

export const addCommentAction = actionClient.inputSchema(commentSchema).action(async ({ parsedInput }) => {
  const supabase = await db()
  const { data, error } = await supabase
    .from('clip_comments')
    .insert({ clip_id: parsedInput.clipId, body: parsedInput.body })
    .select('id,user_id,team_id,nick,body,created_at')
    .single()
  if (error) return { error: chatErrorHe(error.message) }
  return { comment: data }
})

export const loadMoreSquareAction = actionClient
  .inputSchema(feedCursorSchema)
  .action(async ({ parsedInput: { audience, ...before } }) => ({ clips: await getSquareFeed({ audience, before }) }))
