import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { motmRanking } from '../schema'

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

/** The fans' ratings of their club's players for one match, best first, plus the fan's own scores. */
export async function getMotm(fixtureId: number, teamId: string): Promise<{ ranking: MotmRow[]; squad: Omit<MotmRow, 'avg' | 'count' | 'mine'>[]; mine: Record<string, number> }> {
  const supabase = await createClient()
  if (!supabase) return { ranking: [], squad: [], mine: {} }
  const [players, stats, mine] = await Promise.all([
    supabase.from('players').select('id,name_he,name_short,number,position,in_xi').eq('team_id', teamId).not('number', 'is', null).order('in_xi', { ascending: false }).order('number'),
    supabase.from('match_rating_stats').select('player_id,sum,count').eq('fixture_id', fixtureId),
    supabase.from('match_ratings').select('player_id,score').eq('fixture_id', fixtureId),
  ])
  const squad = (players.data ?? []).map((p) => ({ playerId: p.id, name: p.name_he, short: p.name_short, number: p.number, position: p.position }))
  const byId = new Map(squad.map((p) => [p.playerId, p]))
  const myScores: Record<string, number> = {}
  for (const r of mine.data ?? []) myScores[r.player_id] = r.score
  const ranking = motmRanking(stats.data ?? [])
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
