import { describe, expect, it } from 'vitest'
import type { FixtureDetail } from '@/features/matches/schema'
import { buildCardPoll, buildSub60Polls, hebrewName, onPitch, playerKey } from './players'

const xi = (team: number) => Array.from({ length: 11 }, (_, i) => ({ n: i + 1, p: `P${team}-${i + 1}`, pos: 'M', g: null }))
const subs = (team: number) => Array.from({ length: 7 }, (_, i) => ({ n: i + 12, p: `P${team}-${i + 12}`, pos: 'M' }))
const detail: FixtureDetail = {
  ev: [{ m: 55, x: 0, team: 604, p: 'P604-9', as: 'P604-14', type: 'subst', det: 'Substitution 1' }],
  lu: [
    { team: 604, f: '4-3-3', coach: '', xi: xi(604), sub: subs(604) },
    { team: 4486, f: '4-4-2', coach: '', xi: xi(4486), sub: subs(4486) },
  ],
}
const squad = [{ number: 9, name_short: 'זהבי' }]

describe('players', () => {
  it('keys a player by club and shirt number, or name when the number is missing', () => {
    expect(playerKey(604, { n: 9, p: 'E. Zahavi' })).toBe('604:9')
    expect(playerKey(604, { n: null, p: 'E. Zahavi' })).toBe('604:E. Zahavi')
  })
  it('uses the Hebrew name when the shirt number matches our squad', () => {
    expect(hebrewName({ n: 9, p: 'E. Zahavi' }, squad)).toBe('זהבי')
    expect(hebrewName({ n: 30, p: 'D. Turgeman' }, squad)).toBe('D. Turgeman')
  })
  it('knows who is on the pitch after substitutions', () => {
    const { out, bench } = onPitch(detail, 604, 60)
    expect(out).toHaveLength(11)
    expect(out.map((o) => o.id)).toContain('604:14')
    expect(out.map((o) => o.id)).not.toContain('604:9')
    expect(bench).toHaveLength(6)
    expect(bench.map((o) => o.id)).not.toContain('604:14')
    expect(bench.map((o) => o.id)).not.toContain('604:9')
  })
  it('ignores substitutions after the minute asked', () => {
    expect(onPitch(detail, 604, 50).out.map((o) => o.id)).toContain('604:9')
  })
  it('builds one minute-60 card per club', () => {
    const polls = buildSub60Polls(detail, { apiId: 604, clubId: 'mta' }, { apiId: 4486, clubId: 'hta' }, 60, { mta: squad, hta: [] })
    expect(polls.map((p) => p.scope)).toEqual(['mta', 'hta'])
    expect(polls[0]).toMatchObject({ kind: 'sub60', question: 'חילוף: מי יוצא ומי נכנס?' })
    expect(polls[0]!.optionsIn).toHaveLength(6)
  })
  it('builds a yellow-card poll with a "should have been red" option', () => {
    const p = buildCardPoll({ m: 63, x: 0, team: 604, p: 'P604-9', as: '', type: 'Card', det: 'Yellow Card' }, { n: 9, p: 'P604-9' }, squad)
    expect(p.question).toBe('הצהוב לזהבי מוצדק?')
    expect(p.options.map((o) => o.id)).toEqual(['ok', 'no', 'red'])
    expect(p.scope).toBeNull()
  })
})
