import { describe, expect, it } from 'vitest'
import type { Fixture } from '@/features/matches/schema'
import { cardTier, countUsers, minuteLabel, pickTicket, splitPitch, teamAccent, untilLabel } from './schema'

const MIN = 60_000
const KICK = Date.parse('2026-10-17T17:00:00Z')
const fx = (id: number, kickMs: number, st = 'NS', h = 604, a = 563): Fixture => ({
  id,
  t: kickMs / 1000,
  st,
  r: 'R1',
  h,
  a,
  gh: null,
  ga: null,
  v: '',
})

describe('teamAccent (legacy teamColors)', () => {
  it('keeps a bright club colour and puts dark text on it', () => {
    expect(teamAccent('#FFD400')).toEqual({ accent: '#ffd400', accent2: '#ffdc2e', rgb: '255 212 0', text: '#ffd400', on: '#0b0d12' })
  })
  it('lightens dark club colours until they read on the dark page', () => {
    expect(teamAccent('#3550B8')).toEqual({ accent: '#455ebe', accent2: '#667bca', rgb: '69 94 190', text: '#7285ce', on: '#ffffff' })
    expect(teamAccent('#111111').accent).toBe('#707070')
  })
})

describe('minuteLabel', () => {
  it('counts from kick-off like the legacy app', () => {
    expect(minuteLabel(fx(1, KICK, '1H'), KICK + 12.2 * MIN)).toBe("13'")
    expect(minuteLabel(fx(1, KICK, '1H'), KICK + 50 * MIN)).toBe('מחצית')
    expect(minuteLabel(fx(1, KICK, '2H'), KICK + 80 * MIN)).toBe("65'")
    expect(minuteLabel(fx(1, KICK, '2H'), KICK + 109 * MIN)).toBe('90+')
  })
  it('lets the data win for half time and full time', () => {
    expect(minuteLabel(fx(1, KICK, 'HT'), KICK + 40 * MIN)).toBe('מחצית')
    expect(minuteLabel(fx(1, KICK, 'FT'), KICK + 100 * MIN)).toBe('הסתיים')
  })
  it('is empty before kick-off', () => {
    expect(minuteLabel(fx(1, KICK), KICK - MIN)).toBe('')
  })
})

describe('pickTicket', () => {
  const past = fx(1, KICK - 7 * 24 * 60 * MIN, 'FT')
  const today = fx(2, KICK, 'NS')
  const next = fx(3, KICK + 7 * 24 * 60 * MIN, 'NS')
  const other = fx(4, KICK, '1H', 4195, 657)
  const all = [past, today, next, other]
  it('shows the live match of my club', () => {
    expect(pickTicket(all, [604], KICK + 30 * MIN)?.id).toBe(2)
  })
  it('keeps the just-finished match while its room is still open', () => {
    expect(pickTicket([past, { ...today, st: 'FT' }, next], [604], KICK + 150 * MIN)?.id).toBe(2)
    expect(pickTicket([past, { ...today, st: 'FT' }, next], [604], KICK + 171 * MIN)?.id).toBe(3)
  })
  it('does not trust a stale "live" status long after the match', () => {
    expect(pickTicket([{ ...today, st: '2H' }, next], [604], KICK + 200 * MIN)?.id).toBe(3)
  })
  it('falls back to the last finished match off-season', () => {
    expect(pickTicket([past], [604], KICK)?.id).toBe(1)
    expect(pickTicket([other], [604], KICK)).toBeNull()
  })
})

describe('cardTier', () => {
  it('uses the legacy thresholds', () => {
    expect(cardTier(4.2)).toBe('gold')
    expect(cardTier(4.19)).toBe('silver')
    expect(cardTier(3.4)).toBe('silver')
    expect(cardTier(3.39)).toBe('bronze')
    expect(cardTier(null)).toBe('bronze')
  })
})

describe('untilLabel', () => {
  it('reads short Hebrew durations', () => {
    expect(untilLabel(5 * MIN)).toBe('5 דק׳')
    expect(untilLabel(65 * MIN)).toBe('1:05 ש׳')
    expect(untilLabel(20_000)).toBe('דקה')
  })
})

describe('countUsers', () => {
  it('counts a fan once however many tabs are open', () => {
    expect(countUsers({ a: [{ user_id: 'u1' }], b: [{ user_id: 'u1' }], c: [{ user_id: 'u2' }] })).toBe(2)
    expect(countUsers({})).toBe(0)
  })
})

describe('splitPitch', () => {
  const p = (id: string, in_xi: boolean, x: number | null) => ({ id, in_xi, pitch_x: x, pitch_y: x })
  it('puts XI players with a position on the pitch and everyone else on the bench', () => {
    const { xi, bench } = splitPitch([p('a', true, 50), p('b', true, null), p('c', false, 40)])
    expect(xi.map((x) => x.id)).toEqual(['a'])
    expect(bench.map((x) => x.id)).toEqual(['b', 'c'])
  })
})
