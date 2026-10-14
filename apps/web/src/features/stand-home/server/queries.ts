import 'server-only'
import { displayTeam } from '@/features/matches/api-teams'
import type { League } from '@/features/matches/schema'
import { getSquadWithRatings } from '@/features/ratings/server/queries'
import type { PlayerRow } from '@/features/ratings/schema'
import { createClient } from '@/lib/supabase/server'

export type StandHome = {
  events: number
  market: number
  trips: number
  chants: number
  squad: PlayerRow[]
}

/** The API-Football ids that map to our club (a club can appear under more than one name). */
export function clubApiIds(league: League | null, teamId: string): number[] {
  return Object.entries(league?.teams ?? {})
    .filter(([id, t]) => displayTeam(Number(id), t.name).id === teamId)
    .map(([id]) => Number(id))
}

/**
 * The earlier home sections' data in one round of parallel queries (no N+1): counts for events / unsold market items /
 * trips to the next match / chants, and the squad. (The club chat preview moved to features/home.)
 * Team-private (RLS), reads the session: never cached.
 */
export async function getStandHome(teamId: string, userId: string, nextFixtureId: number | null): Promise<StandHome> {
  const supabase = await createClient()
  if (!supabase) return { events: 0, market: 0, trips: 0, chants: 0, squad: [] }
  const since = new Date(Date.now() - 3 * 3600_000).toISOString()
  const [events, market, trips, chants, squad] = await Promise.all([
    supabase.from('fan_events').select('id', { count: 'exact', head: true }).gte('starts_at', since),
    supabase.from('market_items').select('id', { count: 'exact', head: true }).eq('sold', false),
    nextFixtureId === null
      ? Promise.resolve({ count: 0 })
      : supabase.from('trips').select('id', { count: 'exact', head: true }).eq('fixture_id', nextFixtureId),
    supabase.from('chants').select('id', { count: 'exact', head: true }),
    getSquadWithRatings(teamId, userId),
  ])
  return {
    events: events.count ?? 0,
    market: market.count ?? 0,
    trips: trips.count ?? 0,
    chants: chants.count ?? 0,
    squad,
  }
}
