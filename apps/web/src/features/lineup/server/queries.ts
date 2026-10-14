import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { fansXI, isFormation, parseFormations, roleOf, xiFromSaved, type FansXI, type Role, type SavedLineup, type SquadPlayer } from '../schema'

export type FanLineupData = {
  squad: SquadPlayer[]
  mine: SavedLineup | null
  fans: FansXI | null
  /** Fans' average match rating (1–10, one decimal) per player; only after the match. */
  ratings: Record<string, number> | null
}

const ROLE_ORDER: Record<Role, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }

/**
 * Everything the "הרכב" tab needs for the fan's club in one round of parallel reads (no N+1): the squad (index
 * players_team_idx), the fan's own lineup (pk), the club's totals (pk) and tallies (pk prefix), and after the match the
 * fans' ratings (match_rating_stats pk prefix). Reads the session (RLS): never cached.
 */
export async function getFanLineup(fixtureId: number, teamId: string, withRatings: boolean): Promise<FanLineupData> {
  const supabase = await createClient()
  if (!supabase) return { squad: [], mine: null, fans: null, ratings: null }
  const [players, mine, totals, tallies, stats] = await Promise.all([
    supabase.from('players').select('id,number,name_he,name_short,position,injured').eq('team_id', teamId),
    supabase.from('fan_lineups').select('formation,slots').eq('fixture_id', fixtureId).maybeSingle(),
    supabase.from('fan_lineup_totals').select('fans,formations').eq('fixture_id', fixtureId).eq('team_id', teamId).maybeSingle(),
    supabase.from('fan_lineup_tallies').select('formation,slot,player_id,picks').eq('fixture_id', fixtureId).eq('team_id', teamId),
    withRatings
      ? supabase.from('match_rating_stats').select('player_id,sum,count').eq('fixture_id', fixtureId)
      : Promise.resolve({ data: [] as { player_id: string; sum: number; count: number }[] }),
  ])

  const squad: SquadPlayer[] = []
  for (const p of players.data ?? []) {
    const role = roleOf(p.position)
    if (role) squad.push({ id: p.id, number: p.number, name: p.name_he, short: p.name_short, role, injured: p.injured })
  }
  squad.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.number ?? 999) - (b.number ?? 999))
  const known = new Set(squad.map((p) => p.id))

  const t = totals.data
  const fans = t ? fansXI(tallies.data ?? [], { fans: t.fans, formations: parseFormations(t.formations) }, known) : null

  let ratings: Record<string, number> | null = null
  if (withRatings) {
    ratings = {}
    for (const s of stats.data ?? []) if (s.count > 0 && known.has(s.player_id)) ratings[s.player_id] = Math.round((s.sum / s.count) * 10) / 10
  }

  const m = mine.data
  return {
    squad,
    mine: m && isFormation(m.formation) ? { formation: m.formation, xi: xiFromSaved(m.slots) } : null,
    fans,
    ratings,
  }
}
