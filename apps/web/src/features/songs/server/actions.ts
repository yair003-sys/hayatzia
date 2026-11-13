'use server'

import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { moderationHe } from '@/lib/moderation'
import { createSongSchema, songIdSchema, toggleSongSchema } from '../schema'
import { getSong, getSongs } from './queries'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** Called after the browser uploaded the audio to Storage. The database stamps club + nick and rate-limits. */
export const createSongAction = actionClient.inputSchema(createSongSchema).action(async ({ parsedInput }) => {
  const supabase = await db()
  const { data: row, error } = await supabase
    .from('songs')
    .insert({ audio_path: parsedInput.path, title: parsedInput.title, lyrics: parsedInput.lyrics })
    .select('id')
    .single()
  if (error) {
    await supabase.storage.from('songs').remove([parsedInput.path])
    return {
      error:
        moderationHe(error.message) ??
        (error.message.includes('rate_limit') ? 'העלית הרבה שירים — נסו שוב בעוד שעה' : 'הפרסום נכשל, נסו שוב'),
    }
  }
  return { ok: true as const, song: await getSong(row.id) }
})

export const toggleSongLikeAction = actionClient.inputSchema(toggleSongSchema).action(async ({ parsedInput: { songId, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('song_likes').insert({ song_id: songId })
    : await supabase.from('song_likes').delete().eq('song_id', songId)
  return error && error.code !== '23505' ? { error: 'לא הצלחנו לשמור' } : { ok: true as const }
})

export const toggleAdoptAction = actionClient.inputSchema(toggleSongSchema).action(async ({ parsedInput: { songId, on } }) => {
  const supabase = await db()
  const { error } = on
    ? await supabase.from('song_adopts').insert({ song_id: songId })
    : await supabase.from('song_adopts').delete().eq('song_id', songId)
  return error && error.code !== '23505' ? { error: 'לא הצלחנו לאמץ את השיר' } : { ok: true as const }
})

export const deleteSongAction = actionClient.inputSchema(songIdSchema).action(async ({ parsedInput: { songId } }) => {
  const supabase = await db()
  const { data: song } = await supabase.from('songs').select('audio_path').eq('id', songId).maybeSingle()
  const { error } = await supabase.from('songs').delete().eq('id', songId)
  if (error) return { error: 'המחיקה נכשלה' }
  if (song?.audio_path) await supabase.storage.from('songs').remove([song.audio_path])
  return { ok: true as const }
})

export const loadMoreSongsAction = actionClient
  .inputSchema(z.object({ offset: z.number().int().min(0) }))
  .action(async ({ parsedInput: { offset } }) => ({ songs: (await getSongs({ offset })) ?? [] }))
