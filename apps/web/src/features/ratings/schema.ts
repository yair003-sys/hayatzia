import { z } from 'zod'

export const rateSchema = z.object({
  playerId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/),
  stars: z.number().int().min(1, 'בחר בין 1 ל־5 כוכבים').max(5),
  review: z.string().trim().max(200, 'עד 200 תווים').default(''),
})
export const playerIdSchema = z.object({ playerId: rateSchema.shape.playerId })

export type PlayerRow = {
  id: string
  number: number | null
  name_he: string
  name_short: string
  position: string
  injured: boolean
  in_xi: boolean
  avg: number | null
  count: number
  myStars: number | null
  myReview: string
}

export type Review = { user_id: string; nick: string; stars: number; review: string; updated_at: string }

/** Position code → Hebrew group, in pitch order (coach last). */
export function positionGroup(position: string): { order: number; label: string } {
  const p = position.toUpperCase()
  if (p === 'GK' || p === 'G') return { order: 0, label: 'שוערים' }
  if (/^(CB|LB|RB|LWB|RWB|D)$/.test(p)) return { order: 1, label: 'הגנה' }
  if (/^(CM|DM|CDM|AM|CAM|LM|RM|M)$/.test(p)) return { order: 2, label: 'קישור' }
  if (/^(ST|CF|LW|RW|F|SS)$/.test(p)) return { order: 3, label: 'התקפה' }
  return { order: 4, label: 'צוות' }
}

/** Average with one decimal, e.g. 4.3; null when nobody rated yet. */
export function average(sum: number, count: number): number | null {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null
}
