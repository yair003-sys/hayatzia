import { z } from 'zod'

/** The word the fan types to confirm deleting the account. */
export const DELETE_WORD = 'מחק'

/**
 * Storage buckets that keep fan files under `<user id>/…` (migrations: square, stand, team_life, stage4). Files are not
 * rows, so deleting the auth user does not cascade to them: the delete action removes each folder first.
 */
export const USER_BUCKETS = ['clips', 'stand', 'market', 'chants'] as const

/** Strict: the action takes only the confirmation word. The user id always comes from the session, never from input. */
export const deleteAccountSchema = z.strictObject({
  confirm: z
    .string()
    .trim()
    .refine((v) => v === DELETE_WORD, { error: `כדי למחוק, הקלד „${DELETE_WORD}”` }),
})
