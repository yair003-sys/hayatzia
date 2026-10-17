import { describe, expect, it } from 'vitest'
import { goalFromChannelEvent, scorerFromGoalQuestion } from './goal'

// A valid 'poll' broadcast payload uses the database row field names (see pollFromRow).
const goalRow = (question: string) => ({
  id: 'p1',
  fixture_id: 42,
  kind: 'goal',
  question,
  options: [
    { id: 'ok', emoji: '✅', label: 'חוקי' },
    { id: 'no', emoji: '❌', label: 'לא' },
  ],
  options_in: null,
  source: 'event',
  voter_scope: null,
  opens_at: '2026-10-17T20:00:00.000Z',
  closes_at: '2026-10-17T20:01:00.000Z',
  summary: null,
})

describe('scorerFromGoalQuestion', () => {
  it('reads the scorer name', () => {
    expect(scorerFromGoalQuestion('הגול של דני אבדיה חוקי?')).toBe('דני אבדיה')
  })
  it('tolerates a missing question mark', () => {
    expect(scorerFromGoalQuestion('הגול של שחקן חוקי')).toBe('שחקן')
  })
  it('returns null when it is not a goal question', () => {
    expect(scorerFromGoalQuestion('הכרטיס האדום מוצדק?')).toBeNull()
    expect(scorerFromGoalQuestion('')).toBeNull()
  })
})

describe('goalFromChannelEvent: only a goal poll fires', () => {
  it('fires on a goal poll and keeps the scorer', () => {
    expect(goalFromChannelEvent('poll', goalRow('הגול של מוחמד זועבי חוקי?'))).toEqual({ scorer: 'מוחמד זועבי' })
  })
  it('fires even when the scorer cannot be read (scorer null, never a crash)', () => {
    expect(goalFromChannelEvent('poll', { ...goalRow('גול!'), question: 'גול!' })).toEqual({ scorer: null })
  })
  it('ignores a non-goal poll', () => {
    expect(goalFromChannelEvent('poll', { ...goalRow('x'), kind: 'penalty' })).toBeNull()
  })
  it('ignores tally and poll_closed events', () => {
    expect(goalFromChannelEvent('tally', { poll_id: 'p1', tallies: [] })).toBeNull()
    expect(goalFromChannelEvent('poll_closed', { id: 'p1', summary: 's', tallies: [] })).toBeNull()
  })
  it('ignores a malformed payload', () => {
    expect(goalFromChannelEvent('poll', null)).toBeNull()
    expect(goalFromChannelEvent('poll', {})).toBeNull()
  })
})
