'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { blockSchema, reportSchema } from '../schema'

/** Files a report for the moderators. Fans can never read reports back (no select grant). */
export const reportAction = actionClient.inputSchema(reportSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.from('reports').insert(parsedInput)
  if (error) return { error: error.message.includes('rate_limit') ? 'שלחת הרבה דיווחים היום. תודה!' : 'הדיווח לא נשלח' }
  return { ok: true as const }
})

export const blockAction = actionClient.inputSchema(blockSchema).action(async ({ parsedInput: { userId, on } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = on
    ? await supabase.from('blocks').insert({ blocked_id: userId })
    : await supabase.from('blocks').delete().eq('blocked_id', userId)
  if (error && error.code !== '23505') return { error: 'לא הצלחנו לשמור' }
  revalidatePath('/inbox')
  return { ok: true as const }
})
