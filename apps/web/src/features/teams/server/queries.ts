import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'

// A club's squad is reference data: the same rows for everyone (players_read is `using (true)` for anon and
// authenticated), written only by migrations and the seed. So it is read once per club with the cookie-less public
// client and shared by every fan's home, ratings page, fan lineup and player of the match (perf round 2).

export const CLUB_PLAYER_COLUMNS = 'id,number,name_he,name_short,position,injured,in_xi,pitch_x,pitch_y'

export type ClubPlayer = {
  id: string
  number: number | null
  name_he: string
  name_short: string
  position: string
  injured: boolean
  in_xi: boolean
  pitch_x: number | null
  pitch_y: number | null
}

/**
 * The club's squad (unordered, like the table read it replaces), or null when the read failed. Cached per club for an
 * hour (tags `players`, `players:<club>`). Callers sort and filter copies; the cached array is never changed.
 */
export async function getClubPlayers(teamId: string): Promise<ClubPlayer[] | null> {
  try {
    return await clubPlayersCached(teamId)
  } catch {
    return null
  }
}

async function clubPlayersCached(teamId: string): Promise<ClubPlayer[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('players', `players:${teamId}`)
  const db = createPublicClient()
  if (!db) return []
  const { data, error } = await db.from('players').select(CLUB_PLAYER_COLUMNS).eq('team_id', teamId)
  if (error) console.error('club players read failed', error.code)
  // Thrown, not returned: a failure is never kept in the cache.
  if (error || !data) throw new Error('club players read failed')
  return data
}
