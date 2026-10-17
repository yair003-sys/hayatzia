// Perf round 2: the squad and the averages are cached once per club and shared by every fan; each fan's own ratings
// are merged per request. The merge must give each fan their own stars and never change the shared arrays.
import { describe, expect, it } from 'vitest'
import type { ClubPlayer } from '@/features/teams/server/queries'
import { squadWithRatings, type RatingStat } from './club'

const p = (id: string, number: number | null, position: string): ClubPlayer => ({
  id,
  number,
  name_he: id,
  name_short: id,
  position,
  injured: false,
  in_xi: false,
  pitch_x: null,
  pitch_y: null,
})

const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x)
    Object.freeze(v)
  }
  return v
}

// What the shared caches hand to every fan of the club (frozen: any change to them would throw).
const players = deepFreeze([p('st', 9, 'ST'), p('gk', 1, 'GK'), p('cb', 4, 'CB'), p('gk2', null, 'GK')])
const stats: readonly RatingStat[] = deepFreeze([{ player_id: 'st', sum: 9, count: 2 }])

describe('squadWithRatings', () => {
  it('club averages for everyone, own stars per fan, by position then number', () => {
    const a = squadWithRatings(players, stats, [{ player_id: 'st', stars: 5, review: 'מלך' }])
    expect(a.map((r) => r.id)).toEqual(['gk', 'gk2', 'cb', 'st'])
    expect(a.find((r) => r.id === 'st')).toMatchObject({ avg: 4.5, count: 2, myStars: 5, myReview: 'מלך' })
    expect(a.find((r) => r.id === 'gk')).toMatchObject({ avg: null, count: 0, myStars: null, myReview: '' })
  })

  it('the same shared input gives another fan the same club part and only their own stars', () => {
    const a = squadWithRatings(players, stats, [{ player_id: 'st', stars: 5, review: 'מלך' }])
    const b = squadWithRatings(players, stats, [{ player_id: 'gk', stars: 2, review: '' }])
    const club = (rows: typeof a) => rows.map((r) => ({ id: r.id, number: r.number, position: r.position, avg: r.avg, count: r.count }))
    expect(club(b)).toEqual(club(a))
    expect(b.find((r) => r.id === 'st')).toMatchObject({ myStars: null, myReview: '' })
    expect(b.find((r) => r.id === 'gk')).toMatchObject({ myStars: 2 })
    // The cached arrays are untouched (frozen above), in their original order.
    expect(players.map((r) => r.id)).toEqual(['st', 'gk', 'cb', 'gk2'])
  })
})
