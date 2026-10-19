import { describe, expect, it } from 'vitest'
import { hotScore, kindMultiplier, type Rankable } from './ranking'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const base: Rankable = { likes_count: 0, respects_count: 0, comments_count: 0, views_count: 0, created_at: '2026-10-19T12:00:00Z', team_id: 'mta' }
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

describe('hotScore (algorithm v1)', () => {
  it('more engagement scores higher, all else equal', () => {
    expect(hotScore({ ...base, likes_count: 10 }, { now: NOW })).toBeGreaterThan(hotScore({ ...base }, { now: NOW }))
  })

  it('a fresh post with little engagement beats a stale viral one (fast time-decay)', () => {
    const freshQuiet = hotScore({ ...base, likes_count: 1, created_at: hoursAgo(0) }, { now: NOW })
    const staleViral = hotScore({ ...base, likes_count: 100, created_at: hoursAgo(72) }, { now: NOW })
    expect(freshQuiet).toBeGreaterThan(staleViral)
  })

  it('the viewer’s own club is boosted over another club, all else equal', () => {
    const mine = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, { myTeam: 'mta', now: NOW })
    const theirs = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, { myTeam: 'mta', now: NOW })
    expect(mine).toBeGreaterThan(theirs)
  })

  it('with no team context, affinity is neutral (no boost)', () => {
    const a = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, { now: NOW })
    const b = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, { now: NOW })
    expect(a).toBeCloseTo(b)
  })

  it('a fresh post from a club playing now jumps ahead (matchday boost)', () => {
    const live = new Set(['mta'])
    const playingFresh = hotScore({ ...base, team_id: 'mta', likes_count: 2, created_at: hoursAgo(0.5) }, { liveTeams: live, now: NOW })
    const notPlaying = hotScore({ ...base, team_id: 'hta', likes_count: 2, created_at: hoursAgo(0.5) }, { liveTeams: live, now: NOW })
    expect(playingFresh).toBeGreaterThan(notPlaying)
  })

  it('the matchday boost only applies while the post is fresh', () => {
    const live = new Set(['mta'])
    const stale = hotScore({ ...base, team_id: 'mta', likes_count: 2, created_at: hoursAgo(5) }, { liveTeams: live, now: NOW })
    const staleNoLive = hotScore({ ...base, team_id: 'mta', likes_count: 2, created_at: hoursAgo(5) }, { now: NOW })
    expect(stale).toBeCloseTo(staleNoLive)
  })

  it('after a loss, other clubs are damped relative to own club', () => {
    const neutralOther = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, { myTeam: 'mta', now: NOW })
    const lossOther = hotScore({ ...base, team_id: 'hta', likes_count: 5 }, { myTeam: 'mta', mood: 'loss', now: NOW })
    expect(lossOther).toBeLessThan(neutralOther)
    // Own club is untouched by the loss damp.
    const ownNeutral = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, { myTeam: 'mta', now: NOW })
    const ownLoss = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, { myTeam: 'mta', mood: 'loss', now: NOW })
    expect(ownLoss).toBeCloseTo(ownNeutral)
  })

  it('after a win, own club gets an extra lift', () => {
    const neutral = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, { myTeam: 'mta', now: NOW })
    const win = hotScore({ ...base, team_id: 'mta', likes_count: 5 }, { myTeam: 'mta', mood: 'win', now: NOW })
    expect(win).toBeGreaterThan(neutral)
  })

  it('content-type affinity lifts the kind the fan engages with and damps the other', () => {
    const likesVideo = { image: 1, video: 9 } // engages mostly with video
    const vid = hotScore({ ...base, kind: 'video', likes_count: 5 }, { kindAffinity: likesVideo, now: NOW })
    const img = hotScore({ ...base, kind: 'image', likes_count: 5 }, { kindAffinity: likesVideo, now: NOW })
    expect(vid).toBeGreaterThan(img)
  })

  it('no affinity (or both zero) is neutral: kind does not change the score', () => {
    const vid = hotScore({ ...base, kind: 'video', likes_count: 5 }, { now: NOW })
    const img = hotScore({ ...base, kind: 'image', likes_count: 5 }, { now: NOW })
    expect(vid).toBeCloseTo(img)
    const z = hotScore({ ...base, kind: 'video', likes_count: 5 }, { kindAffinity: { image: 0, video: 0 }, now: NOW })
    expect(z).toBeCloseTo(img)
  })

  it('the content-type tilt is bounded (never a takeover)', () => {
    const allVideo = { image: 0, video: 1000 }
    const plain = hotScore({ ...base, kind: 'video', likes_count: 5 }, { now: NOW })
    const tilted = hotScore({ ...base, kind: 'video', likes_count: 5 }, { kindAffinity: allVideo, now: NOW })
    expect(tilted / plain).toBeLessThanOrEqual(1.3)
    expect(tilted / plain).toBeGreaterThan(1)
  })
})

describe('kindMultiplier', () => {
  it('neutral without affinity or kind', () => {
    expect(kindMultiplier('video', null)).toBe(1)
    expect(kindMultiplier(undefined, { image: 1, video: 9 })).toBe(1)
    expect(kindMultiplier('video', { image: 0, video: 0 })).toBe(1)
  })

  it('an unknown kind is neutral (share 0.5)', () => {
    expect(kindMultiplier('gif', { image: 2, video: 8 })).toBeCloseTo(1)
  })
})
