import { describe, expect, it } from 'vitest'
import { canVote, crowdErrorHe, mergePolls, percentages, pollFromRow, pollState, resultsFor, showResults, talliesFromBroadcast, type Poll } from './schema'

const poll: Poll = {
  id: '00000000-0000-0000-0000-00000000aa01',
  fixtureId: 11,
  kind: 'penalty',
  question: 'פנדל?',
  options: [
    { id: 'yes', emoji: '✅', label: 'פנדל' },
    { id: 'no', emoji: '❌', label: 'לא' },
    { id: 'dive', emoji: '🎭', label: 'צלילה' },
  ],
  optionsIn: null,
  source: 'chat',
  scope: null,
  opensAt: '2026-10-12T18:00:00.000Z',
  closesAt: '2026-10-12T18:01:30.000Z',
  summary: null,
}
const closesMs = Date.parse(poll.closesAt)

describe('percentages', () => {
  it('rounds so the parts add up to 100', () => {
    expect(percentages([214, 120, 40])).toEqual([57, 32, 11])
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33])
  })
  it('keeps zeros when nobody voted', () => {
    expect(percentages([0, 0])).toEqual([0, 0])
  })
})

describe('poll state', () => {
  it('is open until the closing moment', () => {
    expect(pollState(poll, closesMs - 1)).toBe('open')
    expect(pollState(poll, closesMs)).toBe('closed')
  })
  it('is closed once it has a summary', () => {
    expect(pollState({ ...poll, summary: '61% מהקהל: פנדל' }, closesMs - 1000)).toBe('closed')
  })
})

describe('who votes and who sees results', () => {
  const sub60 = { ...poll, kind: 'sub60' as const, scope: 'mta' }
  it('club-only cards are for that club', () => {
    expect(canVote(sub60, 'mhf', closesMs - 1)).toBe(false)
    expect(canVote(sub60, 'mta', closesMs - 1)).toBe(true)
    expect(canVote(poll, 'mhf', closesMs)).toBe(false)
  })
  it('results stay hidden until an eligible fan votes', () => {
    expect(showResults(sub60, null, 'mhf', closesMs - 1)).toBe(true)
    expect(showResults(poll, null, 'mta', closesMs - 1)).toBe(false)
    expect(showResults(poll, { option: 'yes', optionIn: null }, 'mta', closesMs - 1)).toBe(true)
    expect(showResults(poll, null, 'mta', closesMs)).toBe(true)
  })
})

describe('results', () => {
  const tallies = [
    { row: 'o' as const, option: 'yes', group: 'h' as const, n: 3 },
    { row: 'o' as const, option: 'no', group: 'a' as const, n: 1 },
    { row: 'o' as const, option: 'yes', group: 'n' as const, n: 0 },
  ]
  it('sums all groups in option order', () => {
    expect(resultsFor(poll, tallies, 'o')).toEqual([
      { option: 'yes', n: 3, pct: 75 },
      { option: 'no', n: 1, pct: 25 },
      { option: 'dive', n: 0, pct: 0 },
    ])
  })
  it('filters one group', () => {
    expect(resultsFor(poll, tallies, 'o', 'a').map((r) => r.pct)).toEqual([0, 100, 0])
  })
})

describe('parsing', () => {
  it('rejects a broken tally broadcast', () => {
    expect(talliesFromBroadcast({})).toBeNull()
  })
  it('reads a tally broadcast', () => {
    expect(talliesFromBroadcast({ poll_id: poll.id, tallies: [{ r: 'o', o: 'yes', g: 'h', n: 2 }] })).toEqual({
      pollId: poll.id,
      tallies: [{ row: 'o', option: 'yes', group: 'h', n: 2 }],
    })
  })
  it('reads a poll row from the database or a broadcast', () => {
    const row = {
      id: poll.id,
      fixture_id: 11,
      kind: 'penalty',
      question: 'פנדל?',
      options: poll.options,
      options_in: null,
      source: 'chat',
      voter_scope: null,
      opens_at: poll.opensAt,
      closes_at: poll.closesAt,
      summary: null,
    }
    expect(pollFromRow(row)).toEqual(poll)
    expect(pollFromRow({ ...row, kind: 'nope' })).toBeNull()
  })
})

describe('vote errors', () => {
  it('speaks Hebrew', () => {
    expect(crowdErrorHe('poll_closed')).toBe('ההצבעה נסגרה')
    expect(crowdErrorHe('not_allowed')).toBe('ההצבעה הזאת רק לאוהדי הקבוצה')
    expect(crowdErrorHe('bad_option')).toBe('בחירה לא תקינה')
    expect(crowdErrorHe('something else')).toBe('ההצבעה לא נקלטה')
  })
})

describe('merging polls', () => {
  const at = (id: string, opensAt: string): Poll => ({ ...poll, id, opensAt })
  it('replaces by id, keeps time order and the latest 20', () => {
    const cur = [at('a', '2026-10-12T18:00:00.000Z'), at('b', '2026-10-12T18:05:00.000Z')]
    const merged = mergePolls(cur, [{ ...at('a', '2026-10-12T18:00:00.000Z'), summary: 'x' }, at('c', '2026-10-12T18:02:00.000Z')])
    expect(merged.map((p) => p.id)).toEqual(['a', 'c', 'b'])
    expect(merged[0]!.summary).toBe('x')
    const many = Array.from({ length: 25 }, (_, i) => at(String(i), new Date(Date.UTC(2026, 9, 12, 18, i)).toISOString()))
    expect(mergePolls([], many).map((p) => p.id)).toEqual(many.slice(5).map((p) => p.id))
  })
  it('knows when a broadcast is about a poll it has not seen', () => {
    expect(mergePolls([at('a', poll.opensAt)], []).some((p) => p.id === 'z')).toBe(false)
  })
})
