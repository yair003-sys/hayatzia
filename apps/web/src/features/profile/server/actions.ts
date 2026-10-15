'use server'

import { moderationHe } from '@/lib/moderation'
import { redirect } from 'next/navigation'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { createProfileSchema } from '../schema'

/** One-time: locks the fan to a club. The database also enforces the lock (trigger + column grants). */
export const createProfileAction = actionClient.inputSchema(createProfileSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'ההתחברות לא זמינה בסביבה הזאת' }
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) redirect('/login')
  const { error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, team_id: parsedInput.teamId, nick: parsedInput.nick })
  if (error && error.code !== '23505') return { error: moderationHe(error.message) ?? 'השמירה נכשלה. נסה שוב' }
  redirect('/stand')
})

export async function signOutAction() {
  const supabase = await createClient()
  await supabase?.auth.signOut()
  redirect('/')
}
