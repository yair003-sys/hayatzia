'use server'

import { moderationHe } from '@/lib/moderation'
import { z } from 'zod'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { chantSchema, checkinErrorHe, checkinSchema, ratingsSchema } from '../schema'

/** The database checks the time window and that the phone is within 500 m of the stadium. */
export const checkInAction = actionClient
  .inputSchema(checkinSchema)
  .action(async ({ parsedInput: { fixtureId, lat, lng } }): Promise<{ number: number; away: boolean; stadium: string } | { error: string }> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'הצ׳ק-אין לא זמין בסביבה הזאת' }
    const { data, error } = await supabase.rpc('check_in', { p_fixture: fixtureId, p_lat: lat, p_lng: lng })
    if (error || !data) return { error: checkinErrorHe(error?.message ?? '') }
    const d = data as { number: number; away: boolean; stadium: string }
    return { number: d.number, away: d.away, stadium: d.stadium }
  })

/** Save the fan's 1–10 scores: new ones inserted together, changed ones updated. */
export const rateMatchAction = actionClient
  .inputSchema(ratingsSchema)
  .action(async ({ parsedInput: { fixtureId, ratings } }): Promise<{ ok: true } | { error: string }> => {
    const supabase = await createClient()
    if (!supabase) return { error: 'הדירוג לא זמין בסביבה הזאת' }
    const { data: existing } = await supabase.from('match_ratings').select('player_id,score').eq('fixture_id', fixtureId)
    const had = new Map((existing ?? []).map((r) => [r.player_id, r.score]))
    const fresh = ratings.filter((r) => !had.has(r.playerId))
    const changed = ratings.filter((r) => had.has(r.playerId) && had.get(r.playerId) !== r.score)
    if (fresh.length) {
      const { error } = await supabase.from('match_ratings').insert(fresh.map((r) => ({ fixture_id: fixtureId, player_id: r.playerId, score: r.score })))
      if (error) return { error: error.message.includes('not_finished') ? 'הדירוג נפתח רק אחרי השריקה, עד שהחדר נסגר' : 'הדירוג לא נשמר' }
    }
    for (const r of changed) {
      const { error } = await supabase.from('match_ratings').update({ score: r.score }).eq('fixture_id', fixtureId).eq('player_id', r.playerId)
      if (error) return { error: 'הדירוג לא נשמר' }
    }
    return { ok: true }
  })

export const toggleFireAction = actionClient
  .inputSchema(z.object({ chantId: z.uuid(), on: z.boolean() }))
  .action(async ({ parsedInput: { chantId, on } }) => {
    const supabase = await createClient()
    if (!supabase) return { ok: false }
    const { error } = on
      ? await supabase.from('chant_fires').insert({ chant_id: chantId })
      : await supabase.from('chant_fires').delete().eq('chant_id', chantId)
    return { ok: !error }
  })

/** Only the club's representative may add (the database enforces it). */
export const addChantAction = actionClient.inputSchema(chantSchema).action(async ({ parsedInput }): Promise<{ ok: true } | { error: string }> => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.from('chants').insert({ title: parsedInput.title, lyrics: parsedInput.lyrics, audio_path: parsedInput.audioPath ?? null })
  if (error) {
    if (parsedInput.audioPath) await supabase.storage.from('chants').remove([parsedInput.audioPath])
    return { error: moderationHe(error.message) ?? 'רק נציג הקהל של הקבוצה יכול להוסיף שירים' }
  }
  return { ok: true }
})
