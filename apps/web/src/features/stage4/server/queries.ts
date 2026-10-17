import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { getClubPlayers } from '@/features/teams/server/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { motmRanking, motmSquad, type RatingStat } from '../schema'

/**
 * The fans' 1–10 totals of the club's players for one match (match_rating_stats), or null when the read failed. Under
 * RLS every fan of the club reads exactly these rows (match_rating_stats_own_club: the player is in the fan's club), so
 * they are read once per match and club with the service role and cached for 30 s (tags `match-ratings:<match>`,
 * `match-ratings:<match>:<club>`; rateMatchAction refreshes them at once). `teamId` must be the signed-in fan's own club
 * (from the caller's session profile). Without a service key, the fan's session reads them (RLS), as before.
 */
export async function getMatchRatingStats(fixtureId: number, teamId: string): Promise<RatingStat[] | null> {
  try {
    const cached = await matchRatingStatsCached(fixtureId, teamId)
    if (cached) return cached
  } catch {
    return null
  }
  const supabase = await createClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('match_rating_stats').select('player_id,sum,count').eq('fixture_id', fixtureId)
  return error || !data ? null : data
}

async function matchRatingStatsCached(fixtureId: number, teamId: string): Promise<RatingStat[] | null> {
  'use cache'
  cacheLife({ stale: 30, revalidate: 30, expire: 120 })
  cacheTag(`match-ratings:${fixtureId}`, `match-ratings:${fixtureId}:${teamId}`)
  const db = createAdminClient()
  // No service key in this environment (fixed per deployment): the caller reads through the fan's session instead.
  if (!db) return null
  const { data, error } = await db
    .from('match_rating_stats')
    .select('player_id,sum,count,players!inner(team_id)')
    .eq('fixture_id', fixtureId)
    .eq('players.team_id', teamId)
  // Permission denied (no service-role grant in this project): like no service key, the fan's session reads them.
  if (error?.code === '42501') return null
  if (error) console.error('match rating stats read failed', error.code)
  // Thrown, not returned: a failure is never kept in the cache.
  if (error || !data) throw new Error('match rating stats read failed')
  return data.map((s) => ({ player_id: s.player_id, sum: s.sum, count: s.count }))
}

/** Has the fan checked in to this match? */
export async function getCheckedIn(fixtureId: number): Promise<boolean> {
  const supabase = await createClient()
  if (!supabase) return false
  const { data } = await supabase.from('checkins').select('fixture_id').eq('fixture_id', fixtureId).maybeSingle()
  return !!data
}

/** Matches the fan was at this season, and how many of them away. */
export async function getAttendance(season: number): Promise<{ games: number; away: number }> {
  const supabase = await createClient()
  if (!supabase) return { games: 0, away: 0 }
  const { data } = await supabase.from('checkins').select('away,fixtures!inner(season)').eq('fixtures.season', season)
  const rows = data ?? []
  return { games: rows.length, away: rows.filter((r) => r.away).length }
}

export type MotmRow = { playerId: string; name: string; short: string; number: number | null; position: string; avg: number; count: number; mine: number | null }

/**
 * The fans' ratings of their club's players for one match, best first, plus the fan's own scores. The squad and the
 * club's totals come from the shared caches; only the fan's own scores are read per request (RLS).
 */
export async function getMotm(fixtureId: number, teamId: string): Promise<{ ranking: MotmRow[]; squad: Omit<MotmRow, 'avg' | 'count' | 'mine'>[]; mine: Record<string, number> }> {
  const supabase = await createClient()
  if (!supabase) return { ranking: [], squad: [], mine: {} }
  const [players, stats, mine] = await Promise.all([
    getClubPlayers(teamId),
    getMatchRatingStats(fixtureId, teamId),
    supabase.from('match_ratings').select('player_id,score').eq('fixture_id', fixtureId),
  ])
  const squad = motmSquad(players ?? []).map((p) => ({ playerId: p.id, name: p.name_he, short: p.name_short, number: p.number, position: p.position }))
  const byId = new Map(squad.map((p) => [p.playerId, p]))
  const myScores: Record<string, number> = {}
  for (const r of mine.data ?? []) myScores[r.player_id] = r.score
  const ranking = motmRanking(stats ?? [])
    .filter((r) => byId.has(r.playerId))
    .map((r) => ({ ...byId.get(r.playerId)!, avg: r.avg, count: r.count, mine: myScores[r.playerId] ?? null }))
  return { ranking, squad, mine: myScores }
}

export type Chant = { id: string; title: string; lyrics: string; audioUrl: string | null; fires: number; fired: boolean; createdAt: string }

/** The club's songs (🔥 first), with signed recordings, and whether the fan is the club's representative. */
export async function getChants(): Promise<{ chants: Chant[]; isRep: boolean }> {
  const supabase = await createClient()
  if (!supabase) return { chants: [], isRep: false }
  const [list, rep] = await Promise.all([
    supabase.from('chants').select('id,title,lyrics,audio_path,fire_count,created_at').order('fire_count', { ascending: false }).order('created_at', { ascending: false }).limit(100),
    supabase.rpc('is_club_rep'),
  ])
  const rows = list.data ?? []
  const ids = rows.map((r) => r.id)
  const paths = rows.map((r) => r.audio_path).filter((p): p is string => !!p)
  const [fires, signed] = await Promise.all([
    ids.length ? supabase.from('chant_fires').select('chant_id').in('chant_id', ids) : Promise.resolve({ data: [] as { chant_id: string }[] }),
    paths.length ? supabase.storage.from('chants').createSignedUrls(paths, 3600) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ])
  const fired = new Set((fires.data ?? []).map((f) => f.chant_id))
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
  return {
    chants: rows.map((r) => ({ id: r.id, title: r.title, lyrics: r.lyrics, audioUrl: r.audio_path ? (urls.get(r.audio_path) ?? null) : null, fires: r.fire_count, fired: fired.has(r.id), createdAt: r.created_at })),
    isRep: rep.data === true,
  }
}
