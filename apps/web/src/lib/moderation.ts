/** Shown on every write path while the fan is suspended. */
export const BANNED_HE = 'החשבון מושעה מכתיבה'

/**
 * The database's language filter (migration 20261015120000_moderation) refuses racism, incitement and threats
 * ('offensive_content') and names with a curse ('offensive_name'); plain curses are masked there and never refused.
 * A fan suspended by an admin cannot write at all ('banned', migration 20261015180000_moderation_admin).
 * This turns those refusals into the fan's words, or null for any other error.
 */
export function moderationHe(message: string | undefined | null): string | null {
  if (!message) return null
  if (message.includes('offensive_content')) return 'לא נשלח: יש בטקסט גזענות, הסתה או איום'
  if (message.includes('offensive_name')) return 'השם מכיל מילה לא ראויה. נסה שם אחר'
  if (/\bbanned\b/.test(message)) return BANNED_HE
  return null
}
