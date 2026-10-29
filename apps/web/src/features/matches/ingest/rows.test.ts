import { describe, expect, it } from 'vitest'
import type { FixtureDetail, League } from '../schema'
import { fromRows, toRows } from './rows'

const league: League = {
  league: { id: 383, season: 2024 },
  teams: {
    '604': { name: 'Maccabi Tel Aviv', logo: 'https://x/604.png' },
    '563': { name: 'Hapoel Beer Sheva', logo: 'https://x/563.png' },
  },
  fixtures: [
    { id: 2, t: 1_724_600_000, st: 'NS', el: null, r: 'Regular Season - 2', h: 563, a: 604, gh: null, ga: null, v: '' },
    { id: 1, t: 1_724_515_200, st: 'FT', el: 90, r: 'Regular Season - 1', h: 604, a: 563, gh: 2, ga: 0, v: 'Bloomfield' },
  ],
  standings: [
    [
      { rank: 1, team: 604, pts: 80, gd: 50, form: 'WWWDW', grp: 'Championship Round', desc: 'UCL', p: 36, w: 24, d: 8, l: 4, gf: 86, ga: 36 },
      { rank: 2, team: 563, pts: 78, gd: 47, form: 'WDWDL', grp: 'Championship Round', desc: '', p: 36, w: 24, d: 8, l: 4, gf: 75, ga: 28 },
    ],
    [{ rank: 1, team: 563, pts: 58, gd: 34, form: '', grp: 'Regular Season', desc: '', p: 26, w: 17, d: 7, l: 2, gf: 50, ga: 16 }],
  ],
  have: [1],
}

const details: Record<number, FixtureDetail> = {
  1: {
    ev: [{ m: 10, x: 0, team: 604, p: 'E. Zahavi', as: '', type: 'Goal', det: 'Normal Goal' }],
    lu: [{ team: 604, f: '4-3-3', coach: 'Coach', xi: [{ n: 1, p: 'GK', pos: 'G', g: '1:1' }], sub: [] }],
  },
}

describe('toRows', () => {
  const rows = toRows(league, details)

  it('maps every fixture with kick-off as ISO time and keeps null scores', () => {
    expect(rows.fixtures).toHaveLength(2)
    const ns = rows.fixtures.find((f) => f.id === 2)
    expect(ns).toMatchObject({ season: 2024, league_id: 383, status: 'NS', home_goals: null, away_goals: null, elapsed: null })
    expect(rows.fixtures.find((f) => f.id === 1)?.kickoff_at).toBe(new Date(1_724_515_200_000).toISOString())
  })

  it('records the order of standings groups', () => {
    expect(rows.standings.map((s) => [s.group_name, s.group_order])).toEqual([
      ['Championship Round', 0],
      ['Championship Round', 0],
      ['Regular Season', 1],
    ])
  })

  it('adds a placeholder team for any id used but missing from the teams map', () => {
    const extra = toRows({ ...league, fixtures: [{ ...league.fixtures[0]!, h: 999 }] }, {})
    expect(extra.apiTeams.find((t) => t.api_id === 999)).toEqual({ api_id: 999, name: '', logo: '' })
  })

  it('only keeps details for fixtures that exist', () => {
    expect(toRows(league, { ...details, 777: details[1]! }).details.map((d) => d.fixture_id)).toEqual([1])
  })
})

describe('fromRows', () => {
  it('round-trips to the same League shape (fixtures sorted by kick-off)', () => {
    const rows = toRows(league, details)
    const back = fromRows({ ...rows, detailIds: rows.details.map((d) => d.fixture_id) })
    expect(back.league).toEqual(league.league)
    expect(back.teams).toEqual(league.teams)
    expect(back.fixtures.map((f) => f.id)).toEqual([1, 2])
    expect(back.fixtures[0]).toEqual(league.fixtures[1])
    expect(back.standings).toEqual(league.standings)
    expect(back.have).toEqual([1])
  })
})

describe('multiple competitions (e.g. the Toto Cup)', () => {
  // A cup fixture carries its own competition id in `lg`; league fixtures leave it unset (the primary league).
  const cup = { id: 5, t: 1_724_700_000, st: 'NS', el: null, r: 'Toto Cup - Group A', lg: 999, h: 604, a: 563, gh: null, ga: null, v: '' }
  const mixed: League = { ...league, fixtures: [...league.fixtures, cup] }

  it('stamps each fixture with its own competition (lg), falling back to the primary league', () => {
    const rows = toRows(mixed, {})
    expect(rows.fixtures.find((f) => f.id === 5)?.league_id).toBe(999) // the cup
    expect(rows.fixtures.find((f) => f.id === 1)?.league_id).toBe(383) // the league (no lg)
  })

  it('round-trips: the league stays primary, the cup fixture keeps its lg', () => {
    const rows = toRows(mixed, {})
    const back = fromRows({ ...rows, detailIds: [] })
    expect(back.league.id).toBe(383) // the most common league_id, not the cup
    expect(back.fixtures.find((f) => f.id === 5)?.lg).toBe(999)
    expect(back.fixtures.find((f) => f.id === 1)?.lg).toBeUndefined()
  })
})

describe('demo fixtures', () => {
  it('flags a demo match so pages can label it', () => {
    const rows = toRows(league, details)
    const demo = { ...rows.fixtures[0]!, id: 900000001, is_demo: true }
    const back = fromRows({ ...rows, fixtures: [...rows.fixtures, demo], detailIds: [] })
    expect(back.fixtures.find((f) => f.id === 900000001)?.dm).toBe(true)
    expect(back.fixtures.find((f) => f.id === 1)?.dm).toBeUndefined()
  })
  it('never sends the flag from the ingest', () => {
    expect(toRows(league, details).fixtures.every((f) => !('is_demo' in f))).toBe(true)
  })
})
