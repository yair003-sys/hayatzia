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

export const markReadSchema = z.object({ kind: z.enum(['dm', 'group']), id: z.uuid() })

const GROUP_ERRORS: Record<string, string> = {
  group_full: `הקבוצה מלאה (עד ${GROUP_MAX} אוהדים)`,
  not_admin: 'רק מנהל הקבוצה יכול לעשות את זה',
  blocked: 'אי אפשר להוסיף את האוהד הזה',
  not_same_team: 'אפשר להזמין רק אוהדים מהקבוצה שלך',
  invite_expired: 'ההזמנה פגה',
  no_members: 'בחר לפחות אוהד אחד',
}

/** Hebrew message for an error code raised by the group functions in the database. */
export function groupErrorHe(code: string): string {
  return GROUP_ERRORS[code] ?? 'הפעולה נכשלה. נסה שוב'
}

/** "חבר אחד" for one, "n חברים" otherwise. */
export function membersLabel(n: number): string {
  return n === 1 ? 'חבר אחד' : `${n} חברים`
}

/**
 * Whose devices a new group message is wrapped for: current admins and members (never invitees or
 * removed fans), minus fans I blocked, plus me. No duplicates.
 */
export function recipientsFor(members: { userId: string; role: string }[], blockedByMe: string[], meId: string): string[] {
  const blocked = new Set(blockedByMe)
  const ids = new Set<string>([meId])
  for (const m of members) {
    if ((m.role === 'admin' || m.role === 'member') && !blocked.has(m.userId)) ids.add(m.userId)
  }
  return [...ids]
}

export type GroupEventKind = 'join' | 'leave' | 'remove' | 'rename'

/** System line for a group event, built from nicknames only (never message content). */
export function eventLine(kind: GroupEventKind, subjectNick: string): string {
  switch (kind) {
    case 'join':
      return `${subjectNick} הצטרף`
    case 'leave':
      return `${subjectNick} עזב`
    case 'remove':
      return `המנהל הוציא את ${subjectNick}`
    case 'rename':
      return 'שם הקבוצה שונה'
  }
}
