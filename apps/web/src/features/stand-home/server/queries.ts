import 'server-only'
import type { ChatMessage } from '@/features/chat/schema'
import { displayTeam } from '@/features/matches/api-teams'
import type { League } from '@/features/matches/schema'
import { getSquadWithRatings } from '@/features/ratings/server/queries'
import type { PlayerRow } from '@/features/ratings/schema'
import { getBlockedIds } from '@/features/safety/server/queries'
import { createClient } from '@/lib/supabase/server'

export type StandHome = {
  fans: number | null
  chat: ChatMessage[]
  events: number
  market: number
  trips: number
  chants: number
  squad: PlayerRow[]
  /** Fans the viewer blocked (hidden in the chat preview). */
  hidden: string[]
}

/** The API-Football ids that map to our club (a club can appear under more than one name). */
export function clubApiIds(league: League | null, teamId: string): number[] {
  return Object.entries(league?.teams ?? {})
    .filter(([id, t]) => displayTeam(Number(id), t.name).id === teamId)
    .map(([id]) => Number(id))
}

/**
 * Everything the home needs in one round of parallel queries (no N+1): verified fans (trigger counter),
 * the last 3 team-chat messages, counts for events / unsold market items / trips to the next match, and the squad.
 * Team-private (RLS), reads the session: never cached.
 */
export async function getStandHome(teamId: string, userId: string, nextFixtureId: number | null): Promise<StandHome> {
  const supabase = await createClient()
  if (!supabase) return { fans: null, chat: [], events: 0, market: 0, trips: 0, chants: 0, squad: [], hidden: [] }
  const since = new Date(Date.now() - 3 * 3600_000).toISOString()
  const [stats, chat, events, market, trips, chants, squad, blocked] = await Promise.all([
    supabase.from('team_stats').select('fans').eq('team_id', teamId).maybeSingle(),
    supabase.from('team_messages').select('id,user_id,nick,body,created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('fan_events').select('id', { count: 'exact', head: true }).gte('starts_at', since),
    supabase.from('market_items').select('id', { count: 'exact', head: true }).eq('sold', false),
    nextFixtureId === null
      ? Promise.resolve({ count: 0 })
      : supabase.from('trips').select('id', { count: 'exact', head: true }).eq('fixture_id', nextFixtureId),
    supabase.from('chants').select('id', { count: 'exact', head: true }),
    getSquadWithRatings(teamId, userId),
    getBlockedIds(),
  ])
  const hidden = new Set(blocked)
  return {
    fans: stats.error ? null : (stats.data?.fans ?? 0),
    chat: (chat.data ?? []).filter((m) => !hidden.has(m.user_id)).slice(0, 3).reverse(),
    events: events.count ?? 0,
    market: market.count ?? 0,
    trips: trips.count ?? 0,
    chants: chants.count ?? 0,
    squad,
    hidden: blocked,
  }
}
