import { z } from 'zod'

// Predictions ("ניחושים"). The database scores (migration 20261012070000_predictions.sql); this mirrors the rule for display.

export type Score = { home: number; away: number }

/** 3 for the exact score, 1 for the right direction, 0 otherwise; null before full time. */
export function pointsFor(guess: Score, result: Score | null): 0 | 1 | 3 | null {
  if (!result) return null
  if (guess.home === result.home && guess.away === result.away) return 3
  return Math.sign(guess.home - guess.away) === Math.sign(result.home - result.away) ? 1 : 0
}

export const guessSchema = z.object({
  fixtureId: z.number().int().positive(),
  home: z.number().int().min(0).max(20),
  away: z.number().int().min(0).max(20),
})

export function predictionErrorHe(message: string): string {
  if (message.includes('locked')) return 'המשחק כבר התחיל, הניחושים נסגרו'
  return 'הניחוש לא נשמר. נסה שוב'
}

export type MyGuess = Score & { points: number | null }
export type BoardRow = { userId: string; nick: string; points: number; exact: number; played: number; rank: number; me: boolean }
