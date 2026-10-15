import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Crowd war reads: counters kept by triggers, read by primary key (no counting at read time). The fan's session
// (RLS): totals for any signed-in fan, the fan row only for its owner. Personal, so never cached.

export type WarScore = { home: number; away: number; mine: number }
export type WarRecord = { wins: number; losses: number; draws: number }

/** Both clubs' points for a match and the fan's own share: two primary-key reads in parallel. */
export async function getWarScore(fixtureId: number, homeId: string, awayId: string): Promise<WarScore> {
  const supabase = await createClient()
  if (!supabase) return { home: 0, away: 0, mine: 0 }
  const [totals, mine] = await Promise.all([
    supabase.from('crowd_war_totals').select('team_id,points').eq('fixture_id', fixtureId),
    supabase.from('crowd_war_fans').select('points').eq('fixture_id', fixtureId).maybeSingle(),
  ])
  const pointsOf = (id: string) => totals.data?.find((r) => r.team_id === id)?.points ?? 0
  return { home: pointsOf(homeId), away: pointsOf(awayId), mine: mine.data?.points ?? 0 }
}

/** The club's crowd-war record in a season (finished wars only). */
export async function getWarRecord(teamId: string, season: number): Promise<WarRecord | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('crowd_war_record', { p_team: teamId, p_season: season })
  const row = data?.[0]
  if (error || !row) return null
  return { wins: row.wins, losses: row.losses, draws: row.draws }
}
