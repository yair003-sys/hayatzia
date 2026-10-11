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
export function messageFromBroadcast(payload: unknown): ChatMessage | null {
  const record = (payload as { record?: Partial<ChatMessage> } | null)?.record
  if (!record) return null
  const { id, user_id, nick, body, created_at } = record
  if (![id, user_id, nick, body, created_at].every((v) => typeof v === 'string')) return null
  return { id, user_id, nick, body, created_at } as ChatMessage
}

/** Clock time in Israel, e.g. "21:07". */
export function chatTime(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(
    new Date(iso),
  )
}
