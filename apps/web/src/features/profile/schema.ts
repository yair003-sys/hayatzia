import { z } from 'zod'
import { TEAMS, type TeamId } from '@/features/teams/data'

const TEAM_IDS = TEAMS.map((t) => t.id) as [TeamId, ...TeamId[]]

export const nickSchema = z
  .string()
  .trim()
  .min(2, 'הכינוי צריך להיות לפחות 2 תווים')
  .max(20, 'הכינוי יכול להיות עד 20 תווים')

export const createProfileSchema = z.object({
  teamId: z.enum(TEAM_IDS, { error: 'בחר קבוצה' }),
  nick: nickSchema,
  confirm: z.literal(true, { error: 'צריך לאשר שהבחירה סופית' }),
})

export type CreateProfileInput = z.infer<typeof createProfileSchema>
