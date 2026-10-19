import { describe, expect, it } from 'vitest'
import { hotScore, type Rankable } from './ranking'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const base: Rankable = { likes_count: 0, respects_count: 0, comments_count: 0, views_count: 0, created_at: '2026-10-19T12:00:00Z', team_id: 'mta' }
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

describe('hotScore (algorithm v1)', () => {
  it('more engagement scores higher, all else equal', () => {
    const quiet = hotScore({ ...base }, null, NOW)
    const busy = hotScore({ ...base, likes_count: 10 }, null, NOW)
    expect(busy).toBeGreaterThan(quiet)
  })

  it('a fresh post with little engagement beats a stale viral one (fast time-decay)', () => {
    const freshQuiet = hotScore({ ...base, likes_count: 1, created_at: hoursAgo(0) }, null, NOW)
    const staleViral = hotScore({ ...base, likes_count: 100, created_at: hoursAgo(72) }, null, NOW)
    expect(freshQuiet).toBeGreaterThan(staleViral)
  })

  it('the viewer’s own club is boosted over another club, all else equal', () => {
    const mine = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, 'mta', NOW)
    const theirs = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, 'mta', NOW)
    expect(mine).toBeGreaterThan(theirs)
  })

  it('with no team context, affinity is neutral (no boost)', () => {
    const a = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, null, NOW)
    const b = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, null, NOW)
    expect(a).toBeCloseTo(b)
  })
})
