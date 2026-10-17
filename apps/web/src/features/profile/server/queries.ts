import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { teamById, type Team } from '@/features/teams/data'

export type SessionProfile =
  | { status: 'disabled' } // no Supabase in this environment (CI, plain local run)
  | { status: 'signed-out' }
  | { status: 'no-profile'; userId: string }
  | { status: 'ready'; userId: string; nick: string; team: Team }
  // The profile read failed (load test 2026-10-17: under load this sent signed-in fans to onboarding, and onboarding
  // then back to the home). Nobody is redirected; the layout says "could not load" and offers a retry.
  | { status: 'error'; userId: string }

/** The signed-in fan and their profile. Deduplicated per request. Reads cookies: call inside <Suspense>. */
export const getSessionProfile = cache(async (): Promise<SessionProfile> => {
  const supabase = await createClient()
  if (!supabase) return { status: 'disabled' }
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) return { status: 'signed-out' }
  const { data: row, error } = await supabase
    .from('profiles')
    .select('nick, team_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { status: 'error', userId }
  const team = row ? teamById(row.team_id) : undefined
  if (!row || !team) return { status: 'no-profile', userId }
  return { status: 'ready', userId, nick: row.nick, team }
})

export type PrivateProfile = { birthDate: string | null; dmRequests: 'everyone' | 'team' | 'qr'; qrCode: string }

/**
 * The fan's own private fields (birth date, request setting in force, QR code), never readable by other fans.
 * Deduplicated per request. Null when signed out or without a profile.
 */
export const getPrivateProfile = cache(async (): Promise<PrivateProfile | null> => {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('my_private_profile')
  const row = data?.[0]
  if (error || !row) return null
  const setting = row.dm_requests === 'everyone' || row.dm_requests === 'qr' ? row.dm_requests : 'team'
  return { birthDate: row.birth_date ?? null, dmRequests: setting, qrCode: row.qr_code }
})
