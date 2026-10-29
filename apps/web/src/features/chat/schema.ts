import { z } from 'zod'
import { moderationHe } from '@/lib/moderation'
import type { FailureKind } from './essentials'

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
  /** Author of the answered message (stamped by the server), so a quote of a blocked fan is hidden. */
  reply_user?: string | null
  reply_nick?: string | null
  reply_body?: string | null
  /** Team chat only: אהבתי / לא אהבתי counts and my own reaction (1 like, -1 dislike, 0 none). */
  likes?: number
  dislikes?: number
  myReaction?: 1 | -1 | 0
  /** This device only: a message that could not be sent (its id is a local one). */
  failed?: boolean
}

/** A live reaction-count update from the "REACTION" broadcast, or null when the shape is unexpected. */
export function reactionFromBroadcast(payload: unknown): { id: string; likes: number; dislikes: number } | null {
  const p = payload as { message_id?: unknown; likes?: unknown; dislikes?: unknown } | null
  if (!p || typeof p.message_id !== 'string' || typeof p.likes !== 'number' || typeof p.dislikes !== 'number') return null
  return { id: p.message_id, likes: p.likes, dislikes: p.dislikes }
}

/** Columns every chat read and write returns. */
export const MESSAGE_COLUMNS = 'id,user_id,nick,body,created_at,reply_to,reply_user,reply_nick,reply_body'

export type Cursor = z.infer<typeof cursorSchema>
/**
 * How a failed send ends: `retry` (network, rate limit: the bubble stays with "נסה שוב"), `permanent` (the text or the
 * room is refused: the text goes back to the box) or `bad_reply` (the answered message is gone: the text goes back
 * without the quote).
 */
export type SendErrorKind = FailureKind
export type SendResult = { message: ChatMessage } | { error: string; kind?: SendErrorKind }

/**
 * Seconds a fan waits between messages in the public chats (team chat + match room; owner, 2026-10-29), shown as a
 * live countdown on the send button. The database keeps its own anti-spam floor (5 per 10 s) behind this.
 */
export const SEND_COOLDOWN_SECONDS = 10

/** Which kind of failure a database error is (see SendErrorKind). Unknown errors may be passing: retry. */
export function chatErrorKind(message: string): SendErrorKind {
  if (message.includes('bad_reply')) return 'bad_reply'
  if (['offensive_content', 'banned', 'room_closed', 'not_playing', 'no profile', 'no such match', '23514'].some((c) => message.includes(c))) {
    return 'permanent'
  }
  return 'retry'
}

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
  const { id, user_id, nick, body, created_at, side, reply_to, reply_user, reply_nick, reply_body } = record
  if (![id, user_id, nick, body, created_at].every((v) => typeof v === 'string')) return null
  const m = { id, user_id, nick, body, created_at } as ChatMessage
  if (side === 'h' || side === 'a') m.side = side
  if (typeof reply_to === 'string') {
    m.reply_to = reply_to
    m.reply_user = typeof reply_user === 'string' ? reply_user : null
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
