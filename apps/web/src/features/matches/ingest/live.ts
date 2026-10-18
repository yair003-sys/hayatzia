// Pure mapping for the every-minute live tick (/api/live/tick): API-Football live fixtures + events → DB rows.
// Reuses toRows and the legacy field mapping (scripts/update.mjs) so the banner/scorer text keeps working.
// No I/O and no 'server-only' here: this module is unit-tested in a plain node environment.
import type { FixtureDetail, League } from '../schema'
import { toRows } from './rows'

/** Shape of one item from GET /fixtures?...&live=all (and the full /fixtures list). Only the fields we read. */
export type ApiFixture = {
  fixture: { id: number; timestamp: number; status: { short: string; elapsed: number | null }; venue?: { name?: string | null } | null }
  league: { id: number; season: number; round?: string | null }
  teams: { home: { id: number; name: string; logo?: string | null }; away: { id: number; name: string; logo?: string | null } }
  goals: { home: number | null; away: number | null }
}

/** Shape of one item from GET /fixtures/events?fixture=<id>. Only the fields we read. */
export type ApiEvent = {
  time: { elapsed: number | null; extra?: number | null }
  team?: { id?: number | null } | null
  player?: { name?: string | null } | null
  assist?: { name?: string | null } | null
  type?: string | null
  detail?: string | null
}

/**
 * API-Football season = the calendar year a season starts in. Ligat Ha'Al runs ~Aug→May, so from July on the
 * season is the current year, before July it is the previous year. Used only when env SEASON is unset.
 */
export function currentSeason(now: number = Date.now()): number {
  const d = new Date(now)
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

/** One live fixture's events in the FixtureDetail `.ev` shape the ingest + describe already use. */
function toEvents(events: ApiEvent[]): FixtureDetail['ev'] {
  return events.map((e) => ({
    m: e.time.elapsed ?? 0,
    x: e.time.extra ?? 0,
    team: e.team?.id ?? 0,
    p: e.player?.name ?? '',
    as: e.assist?.name ?? '',
    type: e.type ?? '',
    det: e.detail ?? '',
  }))
}

export type LiveDetailRow = { fixture_id: number; events: FixtureDetail['ev'] }

/**
 * Maps the live fixtures (already filtered to this league) and their events to the exact rows the DB holds.
 * `detailRows` carry only events — never lineups — so the live path never clobbers the lineups the 10-minute
 * pipeline writes. apiTeams + fixtures come straight from toRows.
 */
export function mapLive(
  liveFixtures: ApiFixture[],
  eventsByFixture: Map<number, ApiEvent[]>,
  leagueId: number,
  season: number,
) {
  const teams: League['teams'] = {}
  const fixtures: League['fixtures'] = liveFixtures.map((x) => {
    for (const side of ['home', 'away'] as const) {
      const t = x.teams[side]
      teams[String(t.id)] = { name: t.name, logo: t.logo ?? '' }
    }
    return {
      id: x.fixture.id,
      t: x.fixture.timestamp,
      st: x.fixture.status.short,
      el: x.fixture.status.elapsed,
      r: x.league.round ?? '',
      h: x.teams.home.id,
      a: x.teams.away.id,
      gh: x.goals.home,
      ga: x.goals.away,
      v: x.fixture.venue?.name ?? '',
    }
  })

  const details: Record<number, FixtureDetail> = {}
  for (const f of fixtures) details[f.id] = { ev: toEvents(eventsByFixture.get(f.id) ?? []), lu: [] }

  const rows = toRows({ league: { id: leagueId, season }, teams, fixtures, standings: [], have: [] }, details)
  const detailRows: LiveDetailRow[] = rows.details.map((d) => ({ fixture_id: d.fixture_id, events: d.events }))
  return { apiTeams: rows.apiTeams, fixtures: rows.fixtures, detailRows }
}
