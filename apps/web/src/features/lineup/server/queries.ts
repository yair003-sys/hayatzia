import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { getMatchRatingStats } from '@/features/stage4/server/queries'
import { getClubPlayers } from '@/features/teams/server/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fansXI, isFormation, parseFormations, roleOf, topFormation, xiFromSaved, type FansXI, type Role, type SavedLineup, type SquadPlayer } from '../schema'

export type FanLineupData = {
  squad: SquadPlayer[]
  mine: SavedLineup | null
  fans: FansXI | null
  /** Fans' average match rating (1–10, one decimal) per player; only after the match. */
  ratings: Record<string, number> | null
}

/** Codes only (no row data) so the logs carry nothing personal. */
function logErrors(errors: Record<string, { code?: string } | null>) {
  for (const [read, e] of Object.entries(errors)) if (e) console.error(`fan lineup: ${read} read failed`, e.code ?? 'unknown')
}

const ROLE_ORDER: Record<Role, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }

type Tally = { formation: string; slot: number; player_id: string; picks: number }
/** The club's fan-lineup totals for a match (null: nobody saved yet) and the tallies of the winning formation. */
export type LineupAggregates = { counts: { fans: number; formations: Record<string, number> } | null; tallies: Tally[] }

const NOTHING_YET: LineupAggregates = { counts: null, tallies: [] }

/**
 * Everything the "הרכב" tab needs for the fan's club, no N+1. The club-wide parts are shared by every fan of the club:
 * the squad (features/teams), the fans' totals and the winning formation's tallies, and after the match the fans'
 * ratings (cached per match and club). Only the fan's own lineup (pk) is read per request (RLS). Read errors are logged
 * by code and read as "nothing yet".
 */
export async function getFanLineup(fixtureId: number, teamId: string, userId: string, withRatings: boolean): Promise<FanLineupData> {
  const supabase = await createClient()
  if (!supabase) return { squad: [], mine: null, fans: null, ratings: null }
  const [players, mine, aggregates, stats] = await Promise.all([
    getClubPlayers(teamId),
    supabase.from('fan_lineups').select('formation,slots').eq('fixture_id', fixtureId).eq('user_id', userId).maybeSingle(),
    getLineupAggregates(fixtureId, teamId),
    withRatings ? getMatchRatingStats(fixtureId, teamId) : Promise.resolve([]),
  ])
  logErrors({ mine: mine.error })

  const squad: SquadPlayer[] = []
  for (const p of players ?? []) {
    const role = roleOf(p.position)
    if (role) squad.push({ id: p.id, number: p.number, name: p.name_he, short: p.name_short, pos: p.position, role, injured: p.injured })
  }
  squad.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.number ?? 999) - (b.number ?? 999))
  const known = new Set(squad.map((p) => p.id))

  const { counts, tallies } = aggregates
  const fans = counts ? fansXI(tallies, counts, known) : null

  let ratings: Record<string, number> | null = null
  if (withRatings) {
    ratings = {}
    for (const s of stats ?? []) if (s.count > 0 && known.has(s.player_id)) ratings[s.player_id] = Math.round((s.sum / s.count) * 10) / 10
  }

  const m = mine.data
  return {
    squad,
    mine: m && isFormation(m.formation) ? { formation: m.formation, xi: xiFromSaved(m.slots) } : null,
    fans,
    ratings,
  }
}

/**
 * The club's fan-lineup totals and the winning formation's tallies (pk prefix fixture, team, formation; at most
 * 11 slots × squad ≈ 275 rows, in a fixed order). Both tables are readable by every signed-in fan
 * (fan_lineup_totals_read / fan_lineup_tallies_read: `using (true)`), so they are read with the service role and cached
 * per match and club for 30 s (tags `fan-lineup:<match>`, `fan-lineup:<match>:<club>`; saveFanLineupAction refreshes
 * them at once). `teamId` is the signed-in fan's own club. Without a service key, the fan's session reads them.
 */
export async function getLineupAggregates(fixtureId: number, teamId: string): Promise<LineupAggregates> {
  try {
    const cached = await lineupAggregatesCached(fixtureId, teamId)
    if (cached) return cached
  } catch {
    return NOTHING_YET
  }
  const supabase = await createClient()
  if (!supabase) return NOTHING_YET
  const totals = await supabase.from('fan_lineup_totals').select('fans,formations').eq('fixture_id', fixtureId).eq('team_id', teamId).maybeSingle()
  logErrors({ totals: totals.error })
  const counts = countsOf(totals.data)
  const top = counts ? topFormation(counts.formations) : null
  if (!top) return { counts, tallies: [] }
  const tallies = await supabase
    .from('fan_lineup_tallies')
    .select('formation,slot,player_id,picks')
    .eq('fixture_id', fixtureId)
    .eq('team_id', teamId)
    .eq('formation', top.formation)
    .order('slot')
    .order('player_id')
  logErrors({ tallies: tallies.error })
  return { counts, tallies: tallies.data ?? [] }
}

function countsOf(t: { fans: number; formations: unknown } | null): LineupAggregates['counts'] {
  return t && t.fans > 0 ? { fans: t.fans, formations: parseFormations(t.formations) } : null
}

async function lineupAggregatesCached(fixtureId: number, teamId: string): Promise<LineupAggregates | null> {
  'use cache'
  cacheLife({ stale: 30, revalidate: 30, expire: 120 })
  cacheTag(`fan-lineup:${fixtureId}`, `fan-lineup:${fixtureId}:${teamId}`)
  const db = createAdminClient()
  // No service key in this environment (fixed per deployment): the caller reads through the fan's session instead.
  if (!db) return null
  const totals = await db.from('fan_lineup_totals').select('fans,formations').eq('fixture_id', fixtureId).eq('team_id', teamId).maybeSingle()
  logErrors({ totals: totals.error })
  // Thrown, not returned: a failure is never kept in the cache.
  if (totals.error) throw new Error('fan lineup totals read failed')
  const counts = countsOf(totals.data)
  const top = counts ? topFormation(counts.formations) : null
  if (!top) return { counts, tallies: [] }
  const tallies = await db
    .from('fan_lineup_tallies')
    .select('formation,slot,player_id,picks')
    .eq('fixture_id', fixtureId)
    .eq('team_id', teamId)
    .eq('formation', top.formation)
    .order('slot')
    .order('player_id')
  logErrors({ tallies: tallies.error })
  if (tallies.error || !tallies.data) throw new Error('fan lineup tallies read failed')
  return { counts, tallies: tallies.data }
}
