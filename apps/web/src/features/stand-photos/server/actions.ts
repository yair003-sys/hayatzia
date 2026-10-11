'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chatErrorHe } from '@/features/chat/schema'
import { createPhotoSchema, photoCommentSchema, photoIdSchema, photoLikeSchema, photosCursorSchema } from '../schema'
import { getPhotoComments, getStandPhotos } from './queries'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const createPhotoAction = actionClient.inputSchema(createPhotoSchema).action(async ({ parsedInput }) => {
  const supabase = await db()
  const { error } = await supabase.from('team_photos').insert({ media_path: parsedInput.path, caption: parsedInput.caption })
  if (error) {
    await supabase.storage.from('stand').remove([parsedInput.path])
    return { error: error.message.includes('rate_limit') ? 'הגעת למקסימום תמונות לשעה' : 'הפרסום נכשל. נסה שוב' }
  }
  revalidatePath('/stand/photos')
  return { ok: true as const }
})

export const likePhotoAction = actionClient.inputSchema(photoLikeSchema).action(async ({ parsedInput: { photoId, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('team_photo_likes').insert({ photo_id: photoId })
    : await supabase.from('team_photo_likes').delete().eq('photo_id', photoId)
  return error && error.code !== '23505' ? { error: 'לא הצלחנו לשמור' } : { ok: true as const }
})

export const deletePhotoAction = actionClient.inputSchema(photoIdSchema).action(async ({ parsedInput: { photoId } }) => {
  const supabase = await db()
  const { data } = await supabase.from('team_photos').select('media_path').eq('id', photoId).maybeSingle()
  if (!data) return { error: 'התמונה לא נמצאה' }
  const { error } = await supabase.from('team_photos').delete().eq('id', photoId)
  if (error) return { error: 'המחיקה נכשלה' }
  await supabase.storage.from('stand').remove([data.media_path])
  return { ok: true as const }
})

export const photoCommentsAction = actionClient
  .inputSchema(photoIdSchema)
  .action(async ({ parsedInput }) => ({ comments: await getPhotoComments(parsedInput.photoId) }))

export const addPhotoCommentAction = actionClient.inputSchema(photoCommentSchema).action(async ({ parsedInput }) => {
  const supabase = await db()
  const { data, error } = await supabase
    .from('team_photo_comments')
    .insert({ photo_id: parsedInput.photoId, body: parsedInput.body })
    .select('id,user_id,nick,body,created_at')
    .single()
  if (error) return { error: chatErrorHe(error.message) }
  return { comment: data }
})

export const morePhotosAction = actionClient
  .inputSchema(photosCursorSchema)
  .action(async ({ parsedInput }) => ({ photos: await getStandPhotos(parsedInput) }))
