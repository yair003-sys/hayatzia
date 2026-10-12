import { describe, expect, it } from 'vitest'
import { guessSchema, pointsFor, predictionErrorHe } from './schema'

describe('pointsFor (same rule as the database)', () => {
  it('3 for the exact score, 1 for the direction, 0 otherwise', () => {
    expect(pointsFor({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(3)
    expect(pointsFor({ home: 1, away: 0 }, { home: 2, away: 1 })).toBe(1)
    expect(pointsFor({ home: 0, away: 0 }, { home: 1, away: 1 })).toBe(1)
    expect(pointsFor({ home: 0, away: 2 }, { home: 2, away: 1 })).toBe(0)
  })
  it('has no points before full time', () => {
    expect(pointsFor({ home: 1, away: 0 }, null)).toBeNull()
  })
})

describe('guessSchema', () => {
  it('accepts 0–20 goals per side', () => {
    expect(guessSchema.safeParse({ fixtureId: 1, home: 0, away: 20 }).success).toBe(true)
    expect(guessSchema.safeParse({ fixtureId: 1, home: -1, away: 0 }).success).toBe(false)
    expect(guessSchema.safeParse({ fixtureId: 1, home: 21, away: 0 }).success).toBe(false)
  })
})

describe('predictionErrorHe', () => {
  it('explains a locked match', () => {
    expect(predictionErrorHe('locked')).toBe('המשחק כבר התחיל, הניחושים נסגרו')
    expect(predictionErrorHe('x')).toBe('הניחוש לא נשמר. נסה שוב')
  })
})
