import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { fromRows } from '../ingest/rows'
import { leagueSchema, type FixtureDetail, type League } from '../schema'

export type { FixtureDetail } from '../schema'

// Source of truth: Postgres (filled by scripts/ingest-league.ts after every legacy update).
// Fallback until cutover: the legacy JSON, used when Supabase isn't configured (CI, local) or has no data yet.
const LEAGUE_URL = 'https://yair003-sys.github.io/hayatzia/data/league.json'
const FIXTURE_URL = (id: number) => `https://yair003-sys.github.io/hayatzia/data/fx/${id}.json`

export async function getLeague(): Promise<League | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag('league')
  return (await leagueFromDb()) ?? (await leagueFromLegacyJson())
}

export async function getFixtureDetail(id: number): Promise<FixtureDetail | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag('league', `fixture-${id}`)
  return (await detailFromDb(id)) ?? (await detailFromLegacyJson(id))
}

async function leagueFromDb(): Promise<League | null> {
  const db = createPublicClient()
  if (!db) return null
  try {
    const latest = await db.from('fixtures').select('season').order('season', { ascending: false }).limit(1)
    const season = latest.data?.[0]?.season
    if (latest.error || season === undefined) return null

    const [teams, fixtures, standings, details] = await Promise.all([
      db.from('api_teams').select('api_id,name,logo'),
      db
        .from('fixtures')
        .select(
          'id,league_id,season,round,kickoff_at,status,elapsed,home_api_id,away_api_id,home_goals,away_goals,venue,is_demo',
        )
        .eq('season', season)
        .order('kickoff_at'),
      db.from('standings').select('*').eq('season', season),
      db.from('fixture_details').select('fixture_id,fixtures!inner(season)').eq('fixtures.season', season),
    ])
    if (teams.error || fixtures.error || standings.error || details.error) return null

    return fromRows({
      apiTeams: teams.data,
      fixtures: fixtures.data,
      standings: standings.data,
      detailIds: details.data.map((d) => d.fixture_id),
    })
  } catch {
    return null
  }
}

async function detailFromDb(id: number): Promise<FixtureDetail | null> {
  const db = createPublicClient()
  if (!db) return null
  try {
    const { data, error } = await db
      .from('fixture_details')
      .select('events,lineups')
      .eq('fixture_id', id)
      .maybeSingle()
    if (error || !data) return null
    // jsonb columns are typed as Json; the shape is guaranteed by the ingest (toRows).
    return { ev: data.events as unknown as FixtureDetail['ev'], lu: data.lineups as unknown as FixtureDetail['lu'] }
  } catch {
    return null
  }
}

async function leagueFromLegacyJson(): Promise<League | null> {
  try {
    const res = await fetch(LEAGUE_URL)
    if (!res.ok) return null
    const parsed = leagueSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function detailFromLegacyJson(id: number): Promise<FixtureDetail | null> {
  try {
    const res = await fetch(FIXTURE_URL(id))
    if (!res.ok) return null
    return (await res.json()) as FixtureDetail
  } catch {
    return null
  }
}
