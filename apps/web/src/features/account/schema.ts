import { z } from 'zod'

/** The word the fan types to confirm deleting the account. */
export const DELETE_WORD = 'מחק'

/**
 * Storage buckets that keep fan files under `<user id>/…` (migrations: square, stand, team_life, stage4). Files are not
 * rows, so deleting the auth user does not cascade to them: the delete action removes each folder first.
 */
export const USER_BUCKETS = ['clips', 'stand', 'market', 'chants'] as const

export const BANNED_DELETE_HE = 'אי אפשר למחוק חשבון בזמן השעיה'
/** The files go first: when the account itself then fails to delete, the fan must know some files are already gone. */
export const PARTIAL_DELETE_HE = 'המחיקה נכשלה, וחלק מהתמונות והסרטונים כבר נמחקו. נסה שוב'

/** Strict: the action takes only the confirmation word. The user id always comes from the session, never from input. */
export const deleteAccountSchema = z.strictObject({
  confirm: z
    .string()
    .trim()
    .refine((v) => v === DELETE_WORD, { error: `כדי למחוק, הקלד „${DELETE_WORD}”` }),
})
