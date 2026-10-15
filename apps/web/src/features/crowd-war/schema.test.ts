import { describe, expect, it } from 'vitest'
import {
  MAX_FAN_POINTS,
  contributedLine,
  fanPoints,
  recordLine,
  resultLine,
  warColours,
  warOutcome,
  warPhase,
  warSplit,
} from './schema'

describe('fan points', () => {
  it('adds 1 per message, 5 per post, 5 for a prediction and 5 for a lineup', () => {
    expect(fanPoints({ chat: 3, posts: 1, predicted: true, lineup: false })).toBe(13)
    expect(fanPoints({ chat: 0, posts: 0, predicted: false, lineup: true })).toBe(5)
  })
  it('caps messages at 20 and posts at 3', () => {
    expect(fanPoints({ chat: 21, posts: 4, predicted: false, lineup: false })).toBe(35)
    expect(fanPoints({ chat: 500, posts: 50, predicted: true, lineup: true })).toBe(MAX_FAN_POINTS)
    expect(MAX_FAN_POINTS).toBe(45)
  })
  it('never goes below zero', () => {
    expect(fanPoints({ chat: -2, posts: -1, predicted: false, lineup: false })).toBe(0)
  })
})

describe('war phase', () => {
  const kickoff = 1_800_000_000 // unix seconds
  const ms = kickoff * 1000
  const h = 3600_000
  it('is closed before the 48-hour window', () => {
    expect(warPhase(kickoff, ms - 48 * h - 1)).toBe('soon')
  })
  it('is open from 48 hours before kick-off until kick-off', () => {
    expect(warPhase(kickoff, ms - 48 * h)).toBe('open')
    expect(warPhase(kickoff, ms - 1)).toBe('open')
  })
  it('is final from kick-off on', () => {
    expect(warPhase(kickoff, ms)).toBe('final')
    expect(warPhase(kickoff, ms + 5 * h)).toBe('final')
  })
})

describe('percentages', () => {
  it('splits by points and adds up to 100', () => {
    expect(warSplit(64, 36)).toEqual({ home: 64, away: 36 })
    expect(warSplit(2, 1)).toEqual({ home: 67, away: 33 })
  })
  it('shows 0–0 as an even bar', () => {
    expect(warSplit(0, 0)).toEqual({ home: 50, away: 50 })
  })
  it('gives everything to the only crowd that scored', () => {
    expect(warSplit(0, 7)).toEqual({ home: 0, away: 100 })
  })
  it('never shows 0% for a crowd with points, nor an equal share for the leader', () => {
    expect(warSplit(1, 999)).toEqual({ home: 1, away: 99 })
    expect(warSplit(101, 100)).toEqual({ home: 51, away: 49 })
    expect(warSplit(100, 101)).toEqual({ home: 49, away: 51 })
  })
})

describe('winner', () => {
  it('names the side with more points, a draw on equal points, none when nobody scored', () => {
    expect(warOutcome(10, 4)).toBe('home')
    expect(warOutcome(4, 10)).toBe('away')
    expect(warOutcome(5, 5)).toBe('draw')
    expect(warOutcome(0, 0)).toBe('none')
  })
  it('writes the frozen result with the winner first', () => {
    expect(resultLine('מכבי', 'בית״ר', 64, 36)).toBe('הקהל של מכבי ניצח 64–36')
    expect(resultLine('מכבי', 'בית״ר', 36, 64)).toBe('הקהל של בית״ר ניצח 64–36')
    expect(resultLine('מכבי', 'בית״ר', 8, 8)).toBe('תיקו בין הקהלים')
    expect(resultLine('מכבי', 'בית״ר', 0, 0)).toBeNull()
  })
})

describe('copy', () => {
  it('says what the fan gave', () => {
    expect(contributedLine(0)).toBe('עוד לא תרמת נקודות')
    expect(contributedLine(1)).toBe('תרמת נקודה אחת')
    expect(contributedLine(12)).toBe('תרמת 12 נקודות')
  })
  it('writes the season record', () => {
    expect(recordLine({ wins: 5, losses: 2, draws: 0 })).toBe('מלחמות קהלים העונה: 5 ניצחונות · 2 הפסדים')
    expect(recordLine({ wins: 1, losses: 1, draws: 1 })).toBe('מלחמות קהלים העונה: ניצחון אחד · הפסד אחד · תיקו אחד')
  })
})

describe('colours', () => {
  it('uses each club bar colour, and the away second colour when both clubs share one', () => {
    expect(warColours({ bar: '#14B85A', ring: '#fff' }, { bar: '#FFD400', ring: '#111111' })).toEqual({ home: '#14B85A', away: '#FFD400' })
    expect(warColours({ bar: '#E0242F', ring: '#111111' }, { bar: '#e0242f', ring: '#ffffff' })).toEqual({ home: '#E0242F', away: '#ffffff' })
  })
  it('keeps a dark second colour off the bar', () => {
    // Maccabi Tel Aviv (yellow / blue) at home to Beitar (yellow / black): the home side turns blue.
    expect(warColours({ bar: '#FFD400', ring: '#1D3FA8' }, { bar: '#FFD400', ring: '#111111' })).toEqual({ home: '#1D3FA8', away: '#FFD400' })
    expect(warColours({ bar: '#FFD400', ring: '#111111' }, { bar: '#FFD400', ring: '#000000' })).toEqual({ home: '#FFD400', away: '#ffffff' })
  })
})
