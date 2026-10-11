'use server'

import { redirect } from 'next/navigation'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { orderedPair, otherUserSchema, teammateSearchSchema } from '../schema'
import { searchTeammates } from './queries'

/** Opens (or reuses) the conversation with a teammate. Carries no message content. */
export const openThreadAction = actionClient.inputSchema(otherUserSchema).action(async ({ parsedInput: { otherId } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) redirect('/login')
  const pair = orderedPair(me, otherId)
  const existing = await supabase.from('dm_threads').select('id').eq('user_a', pair.user_a).eq('user_b', pair.user_b).maybeSingle()
  let id = existing.data?.id
  if (!id) {
    const { data, error } = await supabase.from('dm_threads').insert(pair).select('id').single()
    if (error) {
      if (error.message.includes('blocked')) return { error: 'אי אפשר לפתוח שיחה עם האוהד הזה' }
      return { error: 'פתיחת השיחה נכשלה' }
    }
    id = data.id
  }
  redirect(`/inbox/${id}`)
})

export const searchTeammatesAction = actionClient.inputSchema(teammateSearchSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  const { data: claims } = (await supabase?.auth.getClaims()) ?? { data: null }
  const me = claims?.claims.sub
  if (!me) return { fans: [] }
  return { fans: await searchTeammates(me, parsedInput.q) }
})
