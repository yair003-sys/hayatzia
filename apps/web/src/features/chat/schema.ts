import { z } from 'zod'

export const MESSAGE_MAX = 200
export const PAGE_SIZE = 50

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'ההודעה ריקה').max(MESSAGE_MAX, `עד ${MESSAGE_MAX} תווים`),
})

export const cursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })

export type ChatMessage = {
  id: string
  user_id: string
  nick: string
  body: string
  created_at: string
  /** Match rooms only: the writer's side ('h' home, 'a' away). */
  side?: 'h' | 'a'
}

export type Cursor = z.infer<typeof cursorSchema>
export type SendResult = { message: ChatMessage } | { error: string }

/** Hebrew text for the errors the database raises on insert. */
export function chatErrorHe(message: string): string {
  if (message.includes('rate_limit')) return 'לאט לאט 🙂 נסה שוב בעוד כמה שניות'
  if (message.includes('room_closed')) return 'החדר סגור כרגע'
  if (message.includes('not_playing')) return 'רק אוהדי שתי הקבוצות כותבים בחדר הזה'
  return 'ההודעה לא נשלחה. נסה שוב'
}

/** Adds messages (from the server, the realtime channel or an older page), dropping duplicates, oldest first. */
export function mergeMessages(current: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of current) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at < b.created_at ? -1 : 1,
  )
}

/** Realtime broadcast payload → message, or null when the shape is unexpected. */
/** True when the newest message changed (new messages at the end), not when older ones were prepended. */
export function hasNewTail(prev: readonly ChatMessage[], next: readonly ChatMessage[]): boolean {
  const last = next.at(-1)
  return last !== undefined && last.id !== prev.at(-1)?.id
}

export function messageFromBroadcast(payload: unknown): ChatMessage | null {
  const record = (payload as { record?: Partial<ChatMessage> } | null)?.record
  if (!record) return null
  const { id, user_id, nick, body, created_at, side } = record
  if (![id, user_id, nick, body, created_at].every((v) => typeof v === 'string')) return null
  const m = { id, user_id, nick, body, created_at } as ChatMessage
  if (side === 'h' || side === 'a') m.side = side
  return m
}

/** Clock time in Israel, e.g. "21:07". */
export function chatTime(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(
    new Date(iso),
  )
}
