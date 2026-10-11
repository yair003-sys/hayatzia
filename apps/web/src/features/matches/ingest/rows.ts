// Pure conversions between the legacy league JSON and the Postgres rows (see migration 20261011200000_league_data.sql).
// No runtime imports: scripts/ingest-league.ts runs this file directly with Node's type stripping.
import type { Fixture, FixtureDetail, League, StandingRow } from '../schema'

export type ApiTeamRow = { api_id: number; name: string; logo: string }
export type FixtureRow = {
  id: number
  league_id: number
  season: number
  round: string
  kickoff_at: string
  status: string
  elapsed: number | null
  home_api_id: number
  away_api_id: number
  home_goals: number | null
  away_goals: number | null
  venue: string
}
export type StandingDbRow = {
  season: number
  group_name: string
  group_order: number
  api_team_id: number
  rank: number
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  form: string
  description: string
}
export type FixtureDetailRow = { fixture_id: number; events: FixtureDetail['ev']; lineups: FixtureDetail['lu'] }

export type LeagueRows = {
  apiTeams: ApiTeamRow[]
  fixtures: FixtureRow[]
  standings: StandingDbRow[]
  details: FixtureDetailRow[]
}

export function toRows(league: League, details: Record<number, FixtureDetail>): LeagueRows {
  const { id: leagueId, season } = league.league
  const teams = new Map<number, ApiTeamRow>()
  for (const [id, t] of Object.entries(league.teams)) {
    teams.set(Number(id), { api_id: Number(id), name: t.name, logo: t.logo ?? '' })
  }
  const ensureTeam = (id: number) => {
    if (!teams.has(id)) teams.set(id, { api_id: id, name: '', logo: '' })
  }

  const fixtures = league.fixtures.map((f): FixtureRow => {
    ensureTeam(f.h)
    ensureTeam(f.a)
    return {
      id: f.id,
      league_id: leagueId,
      season,
      round: f.r,
      kickoff_at: new Date(f.t * 1000).toISOString(),
      status: f.st,
      elapsed: f.el ?? null,
      home_api_id: f.h,
      away_api_id: f.a,
      home_goals: f.gh,
      away_goals: f.ga,
      venue: f.v ?? '',
    }
  })

  const standings = league.standings.flatMap((group, order) =>
    group.map((s): StandingDbRow => {
      ensureTeam(s.team)
      return {
        season,
        group_name: s.grp,
        group_order: order,
        api_team_id: s.team,
        rank: s.rank,
        points: s.pts,
        played: s.p,
        won: s.w,
        drawn: s.d,
        lost: s.l,
        gf: s.gf,
        ga: s.ga,
        gd: s.gd,
        form: s.form,
        description: s.desc,
      }
    }),
  )

  const ids = new Set(fixtures.map((f) => f.id))
  const detailRows = Object.entries(details)
    .filter(([id]) => ids.has(Number(id)))
    .map(([id, d]): FixtureDetailRow => ({ fixture_id: Number(id), events: d.ev, lineups: d.lu }))

  return { apiTeams: [...teams.values()], fixtures, standings, details: detailRows }
}

export type LeagueReadRows = Pick<LeagueRows, 'apiTeams' | 'fixtures' | 'standings'> & { detailIds: number[] }

/** Rebuilds the League shape the pages already use. Assumes all rows belong to one season. */
export function fromRows(rows: LeagueReadRows): League {
  const first = rows.fixtures[0]
  const season = first?.season ?? rows.standings[0]?.season ?? 0

  const teams: League['teams'] = {}
  for (const t of rows.apiTeams) teams[String(t.api_id)] = { name: t.name, logo: t.logo }

  const fixtures = rows.fixtures
    .map(
      (f): Fixture => ({
        id: f.id,
        t: Math.round(new Date(f.kickoff_at).getTime() / 1000),
        st: f.status,
        el: f.elapsed,
        r: f.round,
        h: f.home_api_id,
        a: f.away_api_id,
        gh: f.home_goals,
        ga: f.away_goals,
        v: f.venue,
      }),
    )
    .sort((p, q) => p.t - q.t)

  const groups = new Map<number, StandingRow[]>()
  for (const s of [...rows.standings].sort((p, q) => p.group_order - q.group_order || p.rank - q.rank)) {
    const row: StandingRow = {
      rank: s.rank,
      team: s.api_team_id,
      pts: s.points,
      gd: s.gd,
      form: s.form,
      grp: s.group_name,
      desc: s.description,
      p: s.played,
      w: s.won,
      d: s.drawn,
      l: s.lost,
      gf: s.gf,
      ga: s.ga,
    }
    const list = groups.get(s.group_order)
    if (list) list.push(row)
    else groups.set(s.group_order, [row])
  }

  return {
    league: { id: first?.league_id ?? 0, season },
    teams,
    fixtures,
    standings: [...groups.values()],
    have: [...rows.detailIds].sort((p, q) => p - q),
  }
}
