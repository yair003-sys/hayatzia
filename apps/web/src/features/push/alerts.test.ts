import { describe, expect, it } from 'vitest'
import { alertText, freshInOrder, goalMinute, goalsSince, isStale } from './alerts'

const goal = { id: 1, fixture_id: 77, kind: 'goal', home_goals: 2, away_goals: 1, scoring_api_id: 604 }
const ft = { ...goal, kind: 'ft', scoring_api_id: null }

describe('alertText', () => {
  it('goal: title with score, body minute · scorer, opens the match, one tag per fixture', () => {
    expect(alertText(goal, 'מכבי תל אביב', 'הפועל חיפה', ['E. Zahavi'], '67')).toEqual({
      title: '⚽ שער! מכבי תל אביב 2:1 הפועל חיפה',
      body: '67′ · E. Zahavi',
      url: '/matches/77',
      tag: 'match:77',
    })
  })

  it('goal with several scorers lists them all', () => {
    expect(alertText(goal, 'א', 'ב', ['A', 'B'], '45+2').body).toBe('45+2′ · A, B')
  })

  it('goal with unknown scorer: just the minute; unknown minute too: empty body', () => {
    expect(alertText(goal, 'א', 'ב', [], '12').body).toBe('12′')
    expect(alertText(goal, 'א', 'ב', [], null).body).toBe('')
  })

  it('full time', () => {
    expect(alertText(ft, 'מכבי תל אביב', 'הפועל חיפה', [], null)).toEqual({
      title: 'סיום: מכבי תל אביב 2:1 הפועל חיפה',
      body: '',
      url: '/matches/77',
      tag: 'match:77',
    })
  })
})

describe('goalMinute', () => {
  it('adds stoppage time', () => {
    expect(goalMinute(45, 2)).toBe('45+2')
    expect(goalMinute(67, 0)).toBe('67')
  })
})

describe('goalsSince', () => {
  const sides = { home: 604, away: 657 }
  const ev = (m: number, team: number, p: string, det = 'Normal Goal', type = 'Goal') => ({ m, x: 0, team, p, as: '', type, det })
  const events = [
    ev(8, 604, 'Peretz'),
    ev(20, 604, 'Yellow', 'Yellow Card', 'Card'),
    ev(30, 657, 'Away1', 'Penalty'),
    ev(40, 657, 'Missed', 'Missed Penalty'),
    ev(56, 604, 'OG', 'Own Goal'), // own goal: team is the side credited
    ev(61, 604, 'Zahavi'),
  ]

  it('returns the goals after the previously alerted score, with the last minute', () => {
    expect(goalsSince(events, sides, { h: 1, a: 1 }, { h: 3, a: 1 })).toEqual({ scorers: ['OG', 'Zahavi'], minute: '61' })
  })

  it('first goal of the match (no previous alert)', () => {
    expect(goalsSince(events, sides, { h: 0, a: 0 }, { h: 1, a: 0 })).toEqual({ scorers: ['Peretz'], minute: '8' })
  })

  it('away side only, ignores missed penalties and cards', () => {
    expect(goalsSince(events, sides, { h: 1, a: 0 }, { h: 1, a: 1 })).toEqual({ scorers: ['Away1'], minute: '30' })
  })

  it('events not loaded yet → nothing known', () => {
    expect(goalsSince([], sides, { h: 0, a: 0 }, { h: 1, a: 0 })).toEqual({ scorers: [], minute: null })
  })

  it('sorts by minute and stoppage time', () => {
    const late = [{ m: 45, x: 3, team: 604, p: 'B', as: '', type: 'Goal', det: 'Normal Goal' }, { m: 45, x: 1, team: 604, p: 'A', as: '', type: 'Goal', det: 'Normal Goal' }]
    expect(goalsSince(late, sides, { h: 1, a: 0 }, { h: 2, a: 0 })).toEqual({ scorers: ['B'], minute: '45+3' })
  })
})

describe('isStale', () => {
  const now = Date.parse('2026-10-13T12:00:00Z')
  it('older than 30 minutes is stale', () => {
    expect(isStale('2026-10-13T11:29:00Z', now)).toBe(true)
    expect(isStale('2026-10-13T11:31:00Z', now)).toBe(false)
  })
  it('an unreadable date is stale', () => {
    expect(isStale('nope', now)).toBe(true)
  })
})

describe('freshInOrder', () => {
  const now = Date.parse('2026-10-13T12:00:00Z')
  it('drops stale alerts and sends the rest oldest first, so full time is never replaced by an older goal', () => {
    const claimed = [
      { id: 12, created_at: '2026-10-13T11:59:00Z', kind: 'ft' },
      { id: 10, created_at: '2026-10-13T11:50:00Z', kind: 'goal' },
      { id: 3, created_at: '2026-10-13T10:00:00Z', kind: 'goal' },
      { id: 11, created_at: '2026-10-13T11:55:00Z', kind: 'goal' },
    ]
    expect(freshInOrder(claimed, now).map((a) => a.id)).toEqual([10, 11, 12])
    expect(claimed.map((a) => a.id)).toEqual([12, 10, 3, 11]) // input untouched
  })
})
