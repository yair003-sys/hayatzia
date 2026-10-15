import { z } from 'zod'
import { moderationHe } from '@/lib/moderation'

export const MESSAGE_MAX = 200
export const PAGE_SIZE = 50

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'ההודעה ריקה').max(MESSAGE_MAX, `עד ${MESSAGE_MAX} תווים`),
  /** The message this one answers (same chat; checked and snapshotted by the database). */
  replyTo: z.uuid().optional(),
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
  /** A reply: the answered message, with the server's snapshot of its nick and first 80 characters. */
  reply_to?: string | null
  reply_nick?: string | null
  reply_body?: string | null
  /** This device only: a message that could not be sent (its id is a local one). */
  failed?: boolean
}

/** Columns every chat read and write returns. */
export const MESSAGE_COLUMNS = 'id,user_id,nick,body,created_at,reply_to,reply_nick,reply_body'

export type Cursor = z.infer<typeof cursorSchema>
export type SendResult = { message: ChatMessage } | { error: string }

/** Hebrew text for the errors the database raises on insert. */
export function chatErrorHe(message: string): string {
  const moderated = moderationHe(message)
  if (moderated) return moderated
  if (message.includes('rate_limit')) return 'רגע, לאט יותר. נסה שוב בעוד כמה שניות'
  if (message.includes('room_closed')) return 'החדר סגור כרגע'
  if (message.includes('not_playing')) return 'רק אוהדי שתי הקבוצות כותבים בחדר הזה'
  if (message.includes('bad_reply')) return 'ההודעה שענית לה כבר לא זמינה'
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

/** True when the newest message changed (new messages at the end), not when older ones were prepended. */
export function hasNewTail(prev: readonly { id: string }[], next: readonly { id: string }[]): boolean {
  const last = next.at(-1)
  return last !== undefined && last.id !== prev.at(-1)?.id
}

/** How many messages came after the one with `seenId` (0 when unknown). */
export function countAfter(messages: readonly { id: string }[], seenId: string | null): number {
  if (!seenId) return 0
  const i = messages.findIndex((m) => m.id === seenId)
  return i < 0 ? 0 : messages.length - 1 - i
}

/** Realtime broadcast payload → message, or null when the shape is unexpected. */
export function messageFromBroadcast(payload: unknown): ChatMessage | null {
  const record = (payload as { record?: Partial<ChatMessage> } | null)?.record
  if (!record) return null
  const { id, user_id, nick, body, created_at, side, reply_to, reply_nick, reply_body } = record
  if (![id, user_id, nick, body, created_at].every((v) => typeof v === 'string')) return null
  const m = { id, user_id, nick, body, created_at } as ChatMessage
  if (side === 'h' || side === 'a') m.side = side
  if (typeof reply_to === 'string') {
    m.reply_to = reply_to
    m.reply_nick = typeof reply_nick === 'string' ? reply_nick : null
    m.reply_body = typeof reply_body === 'string' ? reply_body : null
  }
  return m
}

/** Clock time in Israel, e.g. "21:07". */
export function chatTime(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(
    new Date(iso),
  )
}
