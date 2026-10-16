'use server'

import { moderationHe } from '@/lib/moderation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { TERMS_VERSION } from '@/lib/legal'
import { birthDateCode, birthDateErrorHe } from '@/features/first-run/schema'
import { safeNext } from '@/features/auth/safe-next'
import { createProfileSchema, setBirthDateSchema } from '../schema'

/**
 * One-time: locks the fan to a club, with the birth date in the same row (the database refuses under 16, so no
 * profile exists without a valid one). The database also enforces the club lock (trigger + column grants).
 */
export const createProfileAction = actionClient.inputSchema(createProfileSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'ההתחברות לא זמינה בסביבה הזאת' }
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) redirect('/login')
  const { error } = await supabase.from('profiles').insert({
    user_id: userId,
    team_id: parsedInput.teamId,
    nick: parsedInput.nick,
    terms_version: TERMS_VERSION,
    birth_date: parsedInput.birthDate,
  })
  if (error && error.code !== '23505') {
    const code = birthDateCode(error.message)
    if (code) return { error: birthDateErrorHe(code) }
    return { error: moderationHe(error.message) ?? 'השמירה נכשלה. נסה שוב' }
  }
  // A fan who signed up from a scanned QR code goes back to that card; anything else to the stand.
  redirect(safeNext(parsedInput.next, '/stand'))
})

/** The one-time prompt for fans who signed up before the birth date existed. Set once (the database refuses a change). */
export const setBirthDateAction = actionClient.inputSchema(setBirthDateSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('set_birth_date', { p_date: parsedInput.birthDate })
  if (error) return { error: birthDateErrorHe(birthDateCode(error.message)) }
  revalidatePath('/', 'layout')
  return { ok: true as const }
})

export async function signOutAction() {
  const supabase = await createClient()
  await supabase?.auth.signOut()
  redirect('/')
}
