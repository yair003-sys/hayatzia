import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { FanCard } from '../schema'
import { fanLabel } from '../fan-identity'

/**
 * The fan's own numbers for "הכרטיס שלי": join date and order in the club, matches attended this season,
 * prediction points and rank, matches rated. Small indexed queries in parallel; RLS keeps them to the fan.
 */
export async function getFanCard(userId: string, teamId: string, season: number | null): Promise<FanCard | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: me } = await supabase.from('profiles').select('created_at,clips_posted').eq('user_id', userId).maybeSingle()
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
  const ratedCount = new Set((rated.data ?? []).map((r) => r.fixture_id)).size
  const exact = totals.data?.exact ?? 0
  return {
    joinedAt: me.created_at,
    number: order.count ?? 1,
    games: checkins.length,
    away: checkins.filter((r) => r.away).length,
    points: totals.data?.points ?? 0,
    exact,
    rank,
    rated: ratedCount,
    // Identity label from what the fan actually does: stadium (die-hard), ratings+predictions (tactician), posts (creator).
    label: fanLabel({ games: checkins.length, tactical: ratedCount + exact, uploads: me.clips_posted }),
  }
}

export type MyClip = { id: string; kind: string; likes: number; url: string | null }

/**
 * The fan's own recent Square clips for the profile grid. Clips expire 24h after posting (the Square rule) and RLS
 * hides expired ones, so this is the last day's posts; the lifetime count lives in `profiles.clips_posted`.
 * Returns null on a read error (the grid then shows the load-error state, never a fake empty grid).
 */
export async function getMyClips(userId: string, limit = 12): Promise<MyClip[] | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('clips')
    .select('id,media_path,kind,likes_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return null
  if (data.length === 0) return []
  const { data: signed } = await supabase.storage.from('clips').createSignedUrls(
    data.map((c) => c.media_path),
    3600,
  )
  return data.map((c, i) => ({ id: c.id, kind: c.kind, likes: c.likes_count, url: signed?.[i]?.signedUrl ?? null }))
}
