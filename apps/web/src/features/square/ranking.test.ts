import { describe, expect, it } from 'vitest'
import { hotScore, type Rankable } from './ranking'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const base: Rankable = { likes_count: 0, respects_count: 0, comments_count: 0, views_count: 0, created_at: '2026-10-19T12:00:00Z', team_id: 'mta' }
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

describe('hotScore (algorithm v1)', () => {
  it('more engagement scores higher, all else equal', () => {
    expect(hotScore({ ...base, likes_count: 10 }, null, null, NOW)).toBeGreaterThan(hotScore({ ...base }, null, null, NOW))
  })

  it('a fresh post with little engagement beats a stale viral one (fast time-decay)', () => {
    const freshQuiet = hotScore({ ...base, likes_count: 1, created_at: hoursAgo(0) }, null, null, NOW)
    const staleViral = hotScore({ ...base, likes_count: 100, created_at: hoursAgo(72) }, null, null, NOW)
    expect(freshQuiet).toBeGreaterThan(staleViral)
  })

  it('the viewer’s own club is boosted over another club, all else equal', () => {
    const mine = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, 'mta', null, NOW)
    const theirs = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, 'mta', null, NOW)
    expect(mine).toBeGreaterThan(theirs)
  })

  it('with no team context, affinity is neutral (no boost)', () => {
    const a = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, null, null, NOW)
    const b = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, null, null, NOW)
    expect(a).toBeCloseTo(b)
  })

  it('a fresh post from a club playing now jumps ahead (matchday boost)', () => {
    const live = new Set(['mta'])
    const playingFresh = hotScore({ ...base, team_id: 'mta', likes_count: 2, created_at: hoursAgo(0.5) }, null, live, NOW)
    const notPlaying = hotScore({ ...base, team_id: 'hta', likes_count: 2, created_at: hoursAgo(0.5) }, null, live, NOW)
    expect(playingFresh).toBeGreaterThan(notPlaying)
  })

  it('the matchday boost only applies while the post is fresh', () => {
    const live = new Set(['mta'])
    const stale = hotScore({ ...base, team_id: 'mta', likes_count: 2, created_at: hoursAgo(5) }, null, live, NOW)
    const staleNoLive = hotScore({ ...base, team_id: 'mta', likes_count: 2, created_at: hoursAgo(5) }, null, null, NOW)
    expect(stale).toBeCloseTo(staleNoLive)
  })
})
