import { describe, expect, it } from 'vitest'
import { currentRoundIndex, groupByRound } from './rounds'
import type { Fixture } from './schema'

const fx = (id: number, r: string, t: number, st = 'FT'): Fixture => ({
  id, r, t, st, h: 1, a: 2, gh: st === 'NS' ? null : 1, ga: st === 'NS' ? null : 0, v: '', el: null,
})

describe('groupByRound', () => {
  it('groups by round in kick-off order', () => {
    const rounds = groupByRound([fx(3, 'R - 2', 300), fx(1, 'R - 1', 100), fx(2, 'R - 1', 200)])
    expect(rounds.map((r) => r.key)).toEqual(['R - 1', 'R - 2'])
    expect(rounds[0]?.fixtures.map((f) => f.id)).toEqual([1, 2])
  })
})

describe('currentRoundIndex', () => {
  it('prefers a live round', () => {
    const rounds = groupByRound([fx(1, 'A', 1), fx(2, 'B', 2, '2H'), fx(3, 'C', 3, 'NS')])
    expect(currentRoundIndex(rounds)).toBe(1)
  })
  it('falls back to the first round with unplayed games', () => {
    const rounds = groupByRound([fx(1, 'A', 1), fx(2, 'B', 2, 'NS')])
    expect(currentRoundIndex(rounds)).toBe(1)
  })
  it('shows the last round when the season is over', () => {
    const rounds = groupByRound([fx(1, 'A', 1), fx(2, 'B', 2)])
    expect(currentRoundIndex(rounds)).toBe(1)
  })
  it('handles an empty season', () => {
    expect(currentRoundIndex([])).toBe(0)
  })
})
