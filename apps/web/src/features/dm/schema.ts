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

export const GROUP_MAX = 20 // members including the creator
export const INVITE_DAYS = 7

export const groupNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'שם קבוצה קצר מדי' })
  .max(40, { error: 'שם קבוצה ארוך מדי' })

const memberIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(GROUP_MAX - 1)
  .refine((ids) => new Set(ids).size === ids.length, { error: 'משתתפים כפולים' })

export const createGroupSchema = z.object({ name: groupNameSchema, memberIds: memberIdsSchema })
export const inviteSchema = z.object({ groupId: z.uuid(), memberIds: memberIdsSchema })
export const groupMemberSchema = z.object({ groupId: z.uuid(), userId: z.uuid() })
export const groupIdSchema = z.object({ groupId: z.uuid() })
export const renameSchema = z.object({ groupId: z.uuid(), name: groupNameSchema })
export const muteSchema = z.object({ groupId: z.uuid(), muted: z.boolean() })

export type InboxRow = {
  kind: 'dm' | 'group'
  id: string
  name: string
  otherId: string | null
  lastAt: string
  lastFrom: string | null
  lastMessageId: string | null
  unread: number
  members: number | null
  muted: boolean
}

export type Invite = { groupId: string; name: string; invitedBy: string; members: number; invitedAt: string }

/** Letter avatar: first letter of the name, hue stable per id. */
export function avatarOf(id: string, name: string): { initial: string; hue: number } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const initial = Array.from(name.trim())[0] ?? '?'
  return { initial, hue: h % 360 }
}

export function unreadLabel(n: number): string | null {
  if (n <= 0) return null
  return n >= 10 ? '9+' : String(n)
}

const PREVIEW_MAX = 60

export function previewText(p: {
  text: string | null
  senderNick: string | null
  mine: boolean
  group: boolean
}): string {
  if (p.text === null) return 'הודעה מוצפנת'
  const body = p.text.replace(/\s+/g, ' ').trim()
  const prefix = p.mine ? 'אתה: ' : p.group && p.senderNick ? `${p.senderNick}: ` : ''
  const full = Array.from(prefix + body)
  return full.length > PREVIEW_MAX ? full.slice(0, PREVIEW_MAX).join('') + '…' : full.join('')
}

export function filterInbox(rows: InboxRow[], q: string): InboxRow[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((r) => r.name.toLowerCase().includes(needle))
}
