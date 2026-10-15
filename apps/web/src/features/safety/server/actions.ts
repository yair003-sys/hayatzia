'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { blockSchema, contactSchema, reportSchema } from '../schema'

const rateLimited = (m: string) => m.includes('rate_limit')

/** Files a report for the moderators. Fans can never read reports back (no select grant). */
export const reportAction = actionClient.inputSchema(reportSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.from('reports').insert(parsedInput)
  if (error) return { error: rateLimited(error.message) ? 'שלחת הרבה דיווחים היום. תודה!' : 'הדיווח לא נשלח' }
  return { ok: true as const }
})

/** "צור קשר": a request to the operator, stored as a report of kind 'contact' (topic in `reason`, text in `note`). */
export const contactAction = actionClient.inputSchema(contactSchema).action(async ({ parsedInput: { topic, text } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.from('reports').insert({ kind: 'contact', ref: '', reason: topic, note: text })
  if (error) return { error: rateLimited(error.message) ? 'שלחת הרבה פניות היום. נסה שוב מחר' : 'הפנייה לא נשלחה. נסה שוב' }
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
