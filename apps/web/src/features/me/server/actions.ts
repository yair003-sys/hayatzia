'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { moderationHe } from '@/lib/moderation'
import { nickSchema } from '@/features/profile/schema'

/**
 * Set (or clear) the fan's profile photo or cover photo. The browser has already uploaded the file to the public
 * `avatars`/`covers` bucket, into the fan's own folder; here we only point the profile row at that path (or at null
 * to remove it). RLS + the `profiles_photo_path` trigger already guarantee a fan can touch only their own row and
 * only a path inside their own folder; the explicit check below is defence in depth. The previous file is deleted
 * after a successful switch so old photos don't pile up in Storage.
 */
const schema = z.object({
  kind: z.enum(['avatar', 'cover']),
  path: z.string().max(200).nullable(),
})

export const setProfilePhotoAction = actionClient.inputSchema(schema).action(async ({ parsedInput: { kind, path } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { error: 'אין חשבון מחובר' }
  if (path && path.split('/')[0] !== uid) return { error: 'נתיב לא חוקי' }

  const bucket = kind === 'avatar' ? 'avatars' : 'covers'
  const { data: before } = await supabase.from('profiles').select('avatar_path,cover_path').eq('user_id', uid).maybeSingle()
  const oldPath = kind === 'avatar' ? (before?.avatar_path ?? null) : (before?.cover_path ?? null)

  const { error } =
    kind === 'avatar'
      ? await supabase.from('profiles').update({ avatar_path: path }).eq('user_id', uid)
      : await supabase.from('profiles').update({ cover_path: path }).eq('user_id', uid)
  if (error) return { error: 'השמירה נכשלה. נסה שוב' }

  // Best effort: a failed cleanup must not fail the save (the new photo is already live).
  if (oldPath && oldPath !== path) await supabase.storage.from(bucket).remove([oldPath])

  revalidatePath('/me')
  const url = path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null
  return { ok: true as const, url }
})

/**
 * "ערוך פרופיל": change the fan's nickname (the name shown to others). The team is locked for life and the photos have
 * their own inline controls, so the nick is the one editable field. RLS limits the update to the fan's own row (and to
 * the nick column via the column grant); the moderation trigger screens the text server-side.
 */
export const updateNickAction = actionClient.inputSchema(z.object({ nick: nickSchema })).action(async ({ parsedInput: { nick } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { error: 'אין חשבון מחובר' }
  const { error } = await supabase.from('profiles').update({ nick }).eq('user_id', uid)
  if (error) return { error: moderationHe(error.message) ?? 'השמירה נכשלה. נסה שוב' }
  revalidatePath('/me')
  return { ok: true as const, nick }
})
