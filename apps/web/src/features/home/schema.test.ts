import { describe, expect, it } from 'vitest'
import type { Fixture } from '@/features/matches/schema'
import {
  countdownCells,
  countdownLabel,
  countdownParts,
  flattenStories,
  groupStories,
  homeCircles,
  initialOf,
  reviewIndex,
  shouldRotate,
  storyStart,
  tableWindow,
} from './schema'

const ME = 'me'

describe('reviewIndex (rotation order)', () => {
  it('walks the reviews in order, most-liked first, and wraps around', () => {
    expect([0, 1, 2, 3, 4].map((t) => reviewIndex(t, 0, 3))).toEqual([0, 1, 2, 0, 1])
  })
  it('staggers the cards so they do not change in lockstep', () => {
    expect([0, 1, 2].map((card) => reviewIndex(0, card, 3))).toEqual([0, 1, 2])
    expect(reviewIndex(1, 2, 3)).toBe(0)
  })
  it('a single review stays put; no reviews → -1', () => {
    expect(reviewIndex(7, 3, 1)).toBe(0)
    expect(reviewIndex(7, 3, 0)).toBe(-1)
  })
})

describe('shouldRotate', () => {
  const on = { visible: true, reducedMotion: false, pageHidden: false, held: false }
  it('rotates only while on screen, with motion allowed, the page visible and nobody holding it', () => {
    expect(shouldRotate(on)).toBe(true)
    expect(shouldRotate({ ...on, visible: false })).toBe(false)
    expect(shouldRotate({ ...on, reducedMotion: true })).toBe(false)
    expect(shouldRotate({ ...on, pageHidden: true })).toBe(false)
    expect(shouldRotate({ ...on, held: true })).toBe(false)
  })
})

describe('groupStories (story ordering)', () => {
  const clip = (id: string, user: string, at: string, seen = false) => ({ id, user_id: user, nick: `nick-${user}`, created_at: at, seen })
  const clips = [
    clip('a2', 'a', '2026-10-14T10:00:00Z', true),
    clip('b1', 'b', '2026-10-14T09:00:00Z'),
    clip('a1', 'a', '2026-10-14T08:00:00Z', true),
    clip('c1', 'c', '2026-10-14T11:00:00Z', true),
    clip('m1', ME, '2026-10-14T12:00:00Z'),
    clip('x1', 'x', '2026-10-14T12:30:00Z'),
    clip('d2', 'd', '2026-10-14T07:00:00Z'),
    clip('d1', 'd', '2026-10-14T06:00:00Z', true),
  ]
  const groups = groupStories(clips, { me: ME, blocked: ['x'] })

  it('one circle per fan, never my own or a blocked fan', () => {
    expect(groups.map((g) => g.userId)).not.toContain(ME)
    expect(groups.map((g) => g.userId)).not.toContain('x')
    expect(groups).toHaveLength(4)
  })
  it('unseen fans first, then seen; each by their latest clip, newest first', () => {
    expect(groups.map((g) => [g.userId, g.seen])).toEqual([
      ['b', false],
      ['d', false],
      ['c', true],
      ['a', true],
    ])
  })
  it("a fan's clips play oldest first; a fan is seen only when all their clips are", () => {
    const d = groups.find((g) => g.userId === 'd')
    expect(d?.clips.map((c) => c.id)).toEqual(['d1', 'd2'])
    expect(d?.seen).toBe(false)
    expect(groups.find((g) => g.userId === 'a')?.clips.map((c) => c.id)).toEqual(['a1', 'a2'])
  })
  it('caps the number of circles', () => {
    expect(groupStories(clips, { me: ME, blocked: [], max: 2 }).map((g) => g.userId)).toEqual(['x', 'b'])
  })
  it('starts at the first unseen clip, or the first clip when all are seen', () => {
    expect(storyStart(groups.find((g) => g.userId === 'd')!)).toBe(1)
    expect(storyStart(groups.find((g) => g.userId === 'a')!)).toBe(0)
  })
  it('flattens to one playlist that knows where each fan starts', () => {
    const { items, starts } = flattenStories(groups)
    expect(items.map((i) => i.clip.id)).toEqual(['b1', 'd1', 'd2', 'c1', 'a1', 'a2'])
    expect(items.map((i) => i.group)).toEqual([0, 1, 1, 2, 3, 3])
    expect(starts).toEqual([0, 2, 3, 4])
  })
})

describe('tableWindow', () => {
  const rows = [1, 2, 3, 4, 5].map((rank) => ({ rank, team: rank * 10 }))
  it('the club with one team above and one below', () => {
    expect(tableWindow(rows, [30]).map((r) => r.rank)).toEqual([2, 3, 4])
  })
  it('at the top or the bottom it still shows three rows', () => {
    expect(tableWindow(rows, [10]).map((r) => r.rank)).toEqual([1, 2, 3])
    expect(tableWindow(rows, [50]).map((r) => r.rank)).toEqual([3, 4, 5])
  })
  it('any of the club ids matches; a missing club gives nothing', () => {
    expect(tableWindow(rows, [99, 20]).map((r) => r.rank)).toEqual([1, 2, 3])
    expect(tableWindow(rows, [99])).toEqual([])
    expect(tableWindow(rows.slice(0, 2), [20]).map((r) => r.rank)).toEqual([1, 2])
  })
})

describe('countdown formatting', () => {
  const S = 1000
  const M = 60 * S
  const H = 60 * M
  const D = 24 * H
  it('splits into days, hours, minutes and seconds; never negative', () => {
    expect(countdownParts(2 * D + 3 * H + 14 * M + 9 * S)).toEqual({ days: 2, hours: 3, minutes: 14, seconds: 9 })
    expect(countdownParts(-5 * S)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })
  it('a day or more: days : hours : minutes; under a day: hours : minutes : seconds', () => {
    expect(countdownCells(2 * D + 3 * H + 14 * M)).toEqual([
      { value: '2', unit: 'ימים' },
      { value: '03', unit: 'שעות' },
      { value: '14', unit: 'דק׳' },
    ])
    expect(countdownCells(5 * H + 7 * M + 9 * S)).toEqual([
      { value: '05', unit: 'שעות' },
      { value: '07', unit: 'דק׳' },
      { value: '09', unit: 'שנ׳' },
    ])
  })
  it('says it in words for screen readers', () => {
    expect(countdownLabel(2 * D + 3 * H + 14 * M)).toBe('בעוד יומיים, 3 שעות ו־14 דקות')
    expect(countdownLabel(D + H + M)).toBe('בעוד יום, שעה ודקה')
    expect(countdownLabel(5 * D + 2 * H)).toBe('בעוד 5 ימים ושעתיים')
    expect(countdownLabel(30 * S)).toBe('בעוד פחות מדקה')
  })
})

describe('homeCircles', () => {
  const H = 3600
  const now = 1_800_000_000_000
  const f = (id: number, dt: number, st: string, h = 1, a = 2): Fixture => ({ id, t: now / 1000 + dt, st, r: 'R', h, a, gh: null, ga: null, v: '' })
  it('"ההרכב שלך" for the next club match that is still open; "דרג את השחקנים" after a finished one (3 days)', () => {
    const out = homeCircles([f(1, -30 * H, 'FT'), f(2, 50 * H, 'NS'), f(3, 10 * H, 'NS', 7, 8)], [1], now)
    expect(out.lineup?.id).toBe(2)
    expect(out.rate?.id).toBe(1)
  })
  it('nothing when the last match is older than 3 days or not finished, and no open match ahead', () => {
    const out = homeCircles([f(1, -80 * H, 'FT'), f(2, -1 * H, '1H'), f(3, -10 * H, 'PST', 9, 2)], [2], now)
    expect(out).toEqual({ lineup: null, rate: null })
  })
})

describe('initialOf', () => {
  it('the first letter of a nickname', () => {
    expect(initialOf('יציע_דרומי')).toBe('י')
    expect(initialOf('  bob')).toBe('B')
    expect(initialOf('')).toBe('?')
  })
})
