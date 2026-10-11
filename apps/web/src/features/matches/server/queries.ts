import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { leagueSchema, type League } from '../schema'

// Read-only public sports data published by the legacy ingest every 10 minutes.
// Moves to Postgres (fixtures/standings tables) later in P1; callers won't change.
const LEAGUE_URL = 'https://yair003-sys.github.io/hayatzia/data/league.json'
const FIXTURE_URL = (id: number) => `https://yair003-sys.github.io/hayatzia/data/fx/${id}.json`

export async function getLeague(): Promise<League | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag('league')
  try {
    const res = await fetch(LEAGUE_URL)
    if (!res.ok) return null
    const parsed = leagueSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export type FixtureDetail = {
  ev: { m: number; x: number; team: number; p: string; as: string; type: string; det: string }[]
  lu: {
    team: number
    f: string
    coach: string
    xi: { n: number | null; p: string; pos: string; g: string | null }[]
    sub: { n: number | null; p: string; pos: string }[]
  }[]
}

export async function getFixtureDetail(id: number): Promise<FixtureDetail | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag('league', `fixture-${id}`)
  try {
    const res = await fetch(FIXTURE_URL(id))
    if (!res.ok) return null
    return (await res.json()) as FixtureDetail
  } catch {
    return null
  }
}
