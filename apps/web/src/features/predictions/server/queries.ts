import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { BoardRow, MyGuess } from '../schema'

/** My guesses for a set of matches (one query). */
export async function getMyGuesses(fixtureIds: number[]): Promise<Record<number, MyGuess>> {
  const supabase = await createClient()
  if (!supabase || fixtureIds.length === 0) return {}
  const { data } = await supabase.from('predictions').select('fixture_id,home_goals,away_goals,points').in('fixture_id', fixtureIds)
  const out: Record<number, MyGuess> = {}
  for (const r of data ?? []) out[r.fixture_id] = { home: r.home_goals, away: r.away_goals, points: r.points }
  return out
}

/** My club's season table: the top 20 plus my own row (two small indexed queries + nicknames). */
export async function getBoard(teamId: string, season: number, userId: string): Promise<{ rows: BoardRow[]; mine: BoardRow | null }> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], mine: null }
  const [top, me] = await Promise.all([
    supabase
      .from('prediction_totals')
      .select('user_id,points,exact,played')
      .eq('team_id', teamId)
      .eq('season', season)
      .order('points', { ascending: false })
      .order('exact', { ascending: false })
      .limit(20),
    supabase.from('prediction_totals').select('user_id,points,exact,played').eq('team_id', teamId).eq('season', season).eq('user_id', userId).maybeSingle(),
  ])
  const list = top.data ?? []
  const ids = [...new Set([...list.map((r) => r.user_id), userId])]
  const { data: profiles } = await supabase.from('profiles').select('user_id,nick').in('user_id', ids)
  const nick = new Map((profiles ?? []).map((p) => [p.user_id, p.nick]))
  const rows = list.map((r, i) => ({ userId: r.user_id, nick: nick.get(r.user_id) ?? 'אוהד', points: r.points, exact: r.exact, played: r.played, rank: i + 1, me: r.user_id === userId }))
  let mine = rows.find((r) => r.me) ?? null
  if (!mine && me.data) {
    const { count } = await supabase
      .from('prediction_totals')
      .select('user_id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('season', season)
      .gt('points', me.data.points)
    mine = { userId, nick: nick.get(userId) ?? 'אני', points: me.data.points, exact: me.data.exact, played: me.data.played, rank: (count ?? 0) + 1, me: true }
  }
  return { rows, mine }
}
