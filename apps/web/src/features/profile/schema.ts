import { z } from 'zod'
import { birthDateSchema } from '@/features/first-run/schema'
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
  /** Birth date (2026-10-16): replaces the "16+" box; the database refuses under 16 too. Never shown to other fans. */
  birthDate: birthDateSchema,
  /** The terms + privacy policy (2026-10-15). Required on the server, so the box cannot be skipped. */
  accept: z.literal(true, { error: 'צריך לאשר את תנאי השימוש ומדיניות הפרטיות' }),
})

export type CreateProfileInput = z.infer<typeof createProfileSchema>

export const setBirthDateSchema = z.object({ birthDate: birthDateSchema })
