import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { FanCard } from '../schema'

/**
 * The fan's own numbers for "הכרטיס שלי": join date and order in the club, matches attended this season,
 * prediction points and rank, matches rated. Small indexed queries in parallel; RLS keeps them to the fan.
 */
export async function getFanCard(userId: string, teamId: string, season: number | null): Promise<FanCard | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: me } = await supabase.from('profiles').select('created_at').eq('user_id', userId).maybeSingle()
  if (!me) return null
  const [order, seen, totals, rated] = await Promise.all([
    supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('team_id', teamId).lte('created_at', me.created_at),
    season === null ? Promise.resolve({ data: [] as { away: boolean }[] }) : supabase.from('checkins').select('away,fixtures!inner(season)').eq('fixtures.season', season),
    season === null
      ? Promise.resolve({ data: null })
      : supabase.from('prediction_totals').select('points,exact').eq('team_id', teamId).eq('season', season).eq('user_id', userId).maybeSingle(),
    supabase.from('match_ratings').select('fixture_id').eq('user_id', userId),
  ])
  let rank: number | null = null
  if (totals.data && season !== null) {
    const { count } = await supabase
      .from('prediction_totals')
      .select('user_id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('season', season)
      .gt('points', totals.data.points)
    rank = (count ?? 0) + 1
  }
  const checkins = seen.data ?? []
  return {
    joinedAt: me.created_at,
    number: order.count ?? 1,
    games: checkins.length,
    away: checkins.filter((r) => r.away).length,
    points: totals.data?.points ?? 0,
    exact: totals.data?.exact ?? 0,
    rank,
    rated: new Set((rated.data ?? []).map((r) => r.fixture_id)).size,
  }
}
