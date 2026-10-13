import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PREFS, toPrefs, type NotificationPrefs } from '../schema'

/** The signed-in fan's notification settings (own row by RLS; primary-key lookup). No row → defaults. */
export async function getMyPrefs(userId: string): Promise<NotificationPrefs> {
  const supabase = await createClient()
  if (!supabase) return DEFAULT_PREFS
  const { data } = await supabase.from('notification_prefs').select('matches,messages').eq('user_id', userId).maybeSingle()
  return toPrefs(data)
}

/**
 * API-Football ids of a club (a club may appear under more than one API name), matched exactly like the database's
 * club_of_api (teams.api_names ↔ api_teams.name), so "my club only" means the same in the banner and in the push.
 * Public reference data, cached.
 */
export async function getClubApiIds(teamId: string): Promise<number[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('league', `club-api-${teamId}`)
  const db = createPublicClient()
  if (!db) return []
  const { data: team } = await db.from('teams').select('api_names').eq('id', teamId).maybeSingle()
  if (!team?.api_names.length) return []
  const { data } = await db.from('api_teams').select('api_id').in('name', team.api_names)
  return (data ?? []).map((t) => t.api_id)
}
