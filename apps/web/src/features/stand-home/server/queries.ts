import 'server-only'
import { displayTeam } from '@/features/matches/api-teams'
import type { League } from '@/features/matches/schema'
import { getSquadWithRatings } from '@/features/ratings/server/queries'
import type { PlayerRow } from '@/features/ratings/schema'
import { createClient } from '@/lib/supabase/server'

/** A count is null when its read failed: the tile shows a dash and the home offers "נסה שוב", never a made-up 0. */
export type StandHome = {
  events: number | null
  market: number | null
  trips: number | null
  chants: number | null
  squad: PlayerRow[]
}

/** The API-Football ids that map to our club (a club can appear under more than one name). */
export function clubApiIds(league: League | null, teamId: string): number[] {
  return Object.entries(league?.teams ?? {})
    .filter(([id, t]) => displayTeam(Number(id), t.name).id === teamId)
    .map(([id]) => Number(id))
}

/** A head count's number, or null when the read failed (load test 2026-10-17, finding 6). */
export function countOf(r: { count: number | null; error: unknown }): number | null {
  return r.error || r.count === null ? null : r.count
}

/**
 * The earlier home sections' data in one round of parallel queries (no N+1): counts for events / unsold market items /
 * trips to the next match / chants, and the squad. (The club chat preview moved to features/home.)
 * The counts are team-private with per-fan exceptions (RLS: a fan also counts their own hidden rows, suspended or
 * unverified ride posters their own trips), so they read the session and are never cached; the squad uses the shared
 * per-club caches (getSquadWithRatings). `nextFixtureId` may still be on its way (the page reads the league
 * meanwhile): only the trips count waits for it.
 */
export async function getStandHome(
  teamId: string,
  userId: string,
  nextFixtureId: number | null | Promise<number | null>,
): Promise<StandHome> {
  const supabase = await createClient()
  if (!supabase) return { events: 0, market: 0, trips: 0, chants: 0, squad: [] }
  const since = new Date(Date.now() - 3 * 3600_000).toISOString()
  const tripsCount = async () => {
    const id = await nextFixtureId
    return id === null
      ? { count: 0, error: null }
      : await supabase.from('trips').select('id', { count: 'exact', head: true }).eq('fixture_id', id)
  }
  const [events, market, trips, chants, squad] = await Promise.all([
    supabase.from('fan_events').select('id', { count: 'exact', head: true }).gte('starts_at', since),
    supabase.from('market_items').select('id', { count: 'exact', head: true }).eq('sold', false),
    tripsCount(),
    supabase.from('chants').select('id', { count: 'exact', head: true }),
    getSquadWithRatings(teamId, userId),
  ])
  return {
    events: countOf(events),
    market: countOf(market),
    trips: countOf(trips),
    chants: countOf(chants),
    squad,
  }
}
