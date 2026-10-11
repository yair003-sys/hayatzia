import { z } from 'zod'

export const DM_PAGE = 50
export const DM_MAX = 1000 // characters of plaintext (ciphertext limit is 4000 base64 chars)

export const otherUserSchema = z.object({ otherId: z.uuid() })
export const teammateSearchSchema = z.object({ q: z.string().trim().max(20).default('') })

export type ThreadSummary = { id: string; otherId: string; otherNick: string; lastAt: string; unreadHint: boolean }

/** Thread members are stored ordered (user_a < user_b), as the database requires. */
export function orderedPair(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a }
}
