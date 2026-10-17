import { z } from 'zod'

// Stage 4: "הייתי שם", fans' player of the match (1–10), stand songs. Rules live in 20261012080000_stage4.sql.

export function checkinErrorHe(message: string): string {
  if (message.includes('too_far')) return 'אתה לא באצטדיון. הצ׳ק-אין עובד רק עד 500 מטר ממנו'
  if (message.includes('not_open')) return 'הצ׳ק-אין פתוח מחצי שעה לפני המשחק ועד שעה אחרי הסיום'
  if (message.includes('no_venue')) return 'אין לנו את מיקום האצטדיון הזה'
  if (message.includes('denied')) return 'צריך לאשר גישה למיקום כדי לעשות צ׳ק-אין'
  if (message.includes('not_playing')) return 'הצ׳ק-אין רק למשחקים של הקבוצה שלך'
  return 'הצ׳ק-אין לא הצליח. נסה שוב'
}

export const checkinSchema = z.object({
  fixtureId: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export type RatingStat = { player_id: string; sum: number; count: number }

/** Highest average first; ties go to the player more fans rated. Average to one decimal. */
export function motmRanking(stats: RatingStat[]): { playerId: string; avg: number; count: number }[] {
  return stats
    .filter((s) => s.count > 0)
    .map((s) => ({ playerId: s.player_id, avg: Math.round((s.sum / s.count) * 10) / 10, count: s.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
}

/**
 * The squad offered for player-of-the-match ratings: numbered players only, the sample XI first, then by shirt number
 * (the order of the table read it replaces). A new array: the club's cached squad is shared and never changed.
 */
export function motmSquad<P extends { number: number | null; in_xi: boolean }>(players: readonly P[]): P[] {
  return players.filter((p) => p.number !== null).sort((a, b) => Number(b.in_xi) - Number(a.in_xi) || (a.number ?? 0) - (b.number ?? 0))
}

export const ratingsSchema = z.object({
  fixtureId: z.number().int().positive(),
  ratings: z
    .array(z.object({ playerId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/), score: z.number().int().min(1).max(10) }))
    .min(1)
    .max(40),
})

export const chantSchema = z.object({
  title: z.string().trim().min(1, 'צריך שם לשיר').max(80),
  lyrics: z.string().trim().max(2000).default(''),
  audioPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp3|m4a|aac|webm|ogg|wav)$/).optional(),
})
