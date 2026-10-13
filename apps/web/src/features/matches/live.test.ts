import { describe, expect, it } from 'vitest'
import { dayStrip, fixturesOn, initials, israelDayKey, liveNow, pitchSpots } from './live'
import type { Fixture } from './schema'

const fx = (id: number, t: number, st = 'NS'): Fixture => ({
  id, t, st, r: 'Regular Season - 1', h: 1, a: 2, gh: null, ga: null, v: '', el: null,
})
const sec = (iso: string) => Date.parse(iso) / 1000

describe('israelDayKey', () => {
  it('uses the Israel date, not the UTC date', () => {
    // 21:30Z on 13 Oct is 00:30 on 14 Oct in Israel (UTC+3 in October)
    expect(israelDayKey(sec('2026-10-13T21:30:00Z'))).toBe('2026-10-14')
  })
  it('keeps a 23:30 Israel kick-off on its own Israel date', () => {
    expect(israelDayKey(sec('2026-10-13T20:30:00Z'))).toBe('2026-10-13')
  })
  it('handles winter time (UTC+2)', () => {
    expect(israelDayKey(sec('2026-12-31T22:30:00Z'))).toBe('2027-01-01')
  })
})

describe('dayStrip', () => {
  it('has 7 days with today in the middle', () => {
    const strip = dayStrip('2026-10-13', [])
    expect(strip).toHaveLength(7)
    expect(strip[3]).toMatchObject({ key: '2026-10-13', today: true, day: 13, weekday: 'ג׳' })
    expect(strip.filter((d) => d.today)).toHaveLength(1)
    expect(strip[0]?.key).toBe('2026-10-10')
    expect(strip[6]?.key).toBe('2026-10-16')
  })
  it('crosses month ends', () => {
    const strip = dayStrip('2026-10-30', [])
    expect(strip.map((d) => d.key)).toEqual([
      '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ])
    expect(strip[5]).toMatchObject({ day: 1, weekday: 'א׳' })
  })
  it('marks days with games by the Israel date', () => {
    const strip = dayStrip('2026-10-13', [fx(1, sec('2026-10-13T21:30:00Z'))])
    expect(strip.find((d) => d.key === '2026-10-14')?.hasGames).toBe(true)
    expect(strip.find((d) => d.key === '2026-10-13')?.hasGames).toBe(false)
  })
})

describe('fixturesOn', () => {
  it('returns that Israel day sorted by kick-off', () => {
    const list = [
      fx(1, sec('2026-10-13T18:00:00Z')),
      fx(2, sec('2026-10-13T15:00:00Z')),
      fx(3, sec('2026-10-13T21:30:00Z')), // next Israel day
      fx(4, sec('2026-10-12T20:59:00Z')), // 23:59 Israel on the 12th
    ]
    expect(fixturesOn('2026-10-13', list).map((f) => f.id)).toEqual([2, 1])
    expect(fixturesOn('2026-10-14', list).map((f) => f.id)).toEqual([3])
    expect(fixturesOn('2026-10-15', list)).toEqual([])
  })
})

describe('liveNow', () => {
  const now = Date.parse('2026-10-13T18:00:00Z')
  const ago = (min: number) => (now - min * 60_000) / 1000
  it('includes a game in progress and excludes a stale live status', () => {
    const list = [fx(1, ago(30), '1H'), fx(2, ago(200), '2H'), fx(3, ago(100), 'FT'), fx(4, ago(-30), 'NS')]
    expect(liveNow(list, now).map((f) => f.id)).toEqual([1])
  })
  it('sorts by kick-off', () => {
    const list = [fx(1, ago(10), '1H'), fx(2, ago(50), 'HT')]
    expect(liveNow(list, now).map((f) => f.id)).toEqual([2, 1])
  })
})

describe('pitchSpots', () => {
  const p = (n: number, g: string | null) => ({ n, p: `P${n}`, pos: 'D', g })
  const xi = [p(1, '1:1'), p(2, '2:1'), p(3, '2:2'), p(4, '2:3'), p(5, '2:4'), p(9, '3:1'), p(10, '3:2')]

  it('is null when any grid is missing', () => {
    expect(pitchSpots([p(1, '1:1'), p(2, null)])).toBeNull()
    expect(pitchSpots([p(1, '1:1'), p(2, 'bad')])).toBeNull()
    expect(pitchSpots([])).toBeNull()
  })
  it('puts the goalkeeper lowest and spreads columns left to right', () => {
    const spots = pitchSpots(xi)!
    expect(spots).toHaveLength(7)
    const gk = spots.find((s) => s.n === 1)!
    expect(Math.min(...spots.map((s) => s.y))).toBe(gk.y)
    expect(gk.x).toBe(50)
    const defs = spots.filter((s) => [2, 3, 4, 5].includes(s.n!))
    const xs = defs.map((s) => s.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    expect(new Set(defs.map((s) => s.y)).size).toBe(1)
    expect(defs[0]!.y).toBeGreaterThan(gk.y)
    expect(spots.find((s) => s.n === 9)!.y).toBeGreaterThan(defs[0]!.y)
    for (const s of spots) {
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(100)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(100)
    }
    expect(spots[0]?.name).toBe('P1')
  })
})

describe('initials', () => {
  it('takes up to two initials and strips gershayim', () => {
    expect(initials('מכבי ת״א')).toBe('מת')
    expect(initials('הפועל באר שבע')).toBe('הב')
    expect(initials('בית"ר ירושלים')).toBe('בי')
    expect(initials('מ.ס. אשדוד')).toBe('מא')
    expect(initials('Maccabi Haifa')).toBe('MH')
    expect(initials('אשדוד')).toBe('א')
    expect(initials('  ')).toBe('')
  })
})
