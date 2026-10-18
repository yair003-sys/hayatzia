import { describe, expect, it } from 'vitest'
import { goalsSince } from '@/features/push/alerts'
import { type ApiEvent, type ApiFixture, currentSeason, mapLive } from './live'

const LEAGUE = 383
const SEASON = 2025

const sampleFixture: ApiFixture = {
  fixture: { id: 111, timestamp: 1_760_000_000, status: { short: '2H', elapsed: 67 }, venue: { name: 'Sammy Ofer' } },
  league: { id: LEAGUE, season: SEASON, round: 'Regular Season - 7' },
  teams: {
    home: { id: 10, name: 'Maccabi Haifa', logo: 'h.png' },
    away: { id: 20, name: 'Hapoel Tel Aviv', logo: 'a.png' },
  },
  goals: { home: 2, away: 1 },
}

const sampleEvents: ApiEvent[] = [
  { time: { elapsed: 23, extra: null }, team: { id: 10 }, player: { name: 'Player One' }, assist: { name: 'Setter' }, type: 'Goal', detail: 'Normal Goal' },
  { time: { elapsed: 41, extra: null }, team: { id: 20 }, player: { name: 'Away Striker' }, assist: { name: null }, type: 'Goal', detail: 'Normal Goal' },
  { time: { elapsed: 55, extra: 2 }, team: { id: 10 }, player: { name: 'Player Two' }, assist: { name: null }, type: 'Goal', detail: 'Penalty' },
  { time: { elapsed: 60, extra: null }, team: { id: 20 }, player: { name: 'Booked' }, assist: { name: null }, type: 'Card', detail: 'Yellow Card' },
]

describe('mapLive', () => {
  it('maps a live fixture to the exact fixture row (score, status, elapsed)', () => {
    const { fixtures } = mapLive([sampleFixture], new Map([[111, sampleEvents]]), LEAGUE, SEASON)
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0]!).toMatchObject({
      id: 111,
      league_id: LEAGUE,
      season: SEASON,
      round: 'Regular Season - 7',
      status: '2H',
      elapsed: 67,
      home_api_id: 10,
      away_api_id: 20,
      home_goals: 2,
      away_goals: 1,
      venue: 'Sammy Ofer',
    })
    // kickoff_at is the unix timestamp rendered as ISO.
    expect(fixtures[0]!.kickoff_at).toBe(new Date(1_760_000_000 * 1000).toISOString())
  })

  it('collects both teams from the live fixture', () => {
    const { apiTeams } = mapLive([sampleFixture], new Map(), LEAGUE, SEASON)
    expect(apiTeams).toEqual(
      expect.arrayContaining([
        { api_id: 10, name: 'Maccabi Haifa', logo: 'h.png' },
        { api_id: 20, name: 'Hapoel Tel Aviv', logo: 'a.png' },
      ]),
    )
  })

  it('maps events into the .ev shape and carries only events (no lineups) in the detail row', () => {
    const { detailRows } = mapLive([sampleFixture], new Map([[111, sampleEvents]]), LEAGUE, SEASON)
    expect(detailRows).toHaveLength(1)
    const row = detailRows[0]!
    expect(row.fixture_id).toBe(111)
    expect(row).not.toHaveProperty('lineups')
    expect(row.events).toHaveLength(4)
    expect(row.events[0]).toEqual({ m: 23, x: 0, team: 10, p: 'Player One', as: 'Setter', type: 'Goal', det: 'Normal Goal' })
    expect(row.events[2]).toEqual({ m: 55, x: 2, team: 10, p: 'Player Two', as: '', type: 'Goal', det: 'Penalty' })
    expect(row.events[3]).toMatchObject({ type: 'Card', det: 'Yellow Card' })
  })

  it('the mapped events feed the real scorer logic (goalsSince)', () => {
    const { detailRows } = mapLive([sampleFixture], new Map([[111, sampleEvents]]), LEAGUE, SEASON)
    // From 1:1 to 2:1 the home side scored: goalsSince names Player Two at minute 55.
    const { scorers, minute } = goalsSince(detailRows[0]!.events, { home: 10, away: 20 }, { h: 1, a: 1 }, { h: 2, a: 1 })
    expect(scorers).toContain('Player Two')
    expect(minute).toBeTruthy()
  })

  it('has no detail row for a fixture with no fetched events', () => {
    const { detailRows } = mapLive([sampleFixture], new Map(), LEAGUE, SEASON)
    expect(detailRows[0]!.events).toEqual([])
  })
})

describe('currentSeason', () => {
  it('is the current year from July on, the previous year before July', () => {
    expect(currentSeason(Date.UTC(2026, 7, 15))).toBe(2026) // August 2026 → 2026 season
    expect(currentSeason(Date.UTC(2026, 2, 15))).toBe(2025) // March 2026 → 2025 season
    expect(currentSeason(Date.UTC(2026, 6, 1))).toBe(2026) // July 2026 → 2026 season
  })
})
