import { z } from 'zod'
import { BANNED_HE } from '@/lib/moderation'

export const DM_PAGE = 50
export const DM_MAX = 1000 // characters of plaintext (ciphertext limit is 4000 base64 chars)

export const otherUserSchema = z.object({ otherId: z.uuid() })
export const teammateSearchSchema = z.object({ q: z.string().trim().max(20).default('') })

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
  /** Private threads only: a message request not yet accepted (incoming: someone asks me; outgoing: I asked). */
  request: RequestSide
  /** Private threads only: the other fan's club (stamped on the thread). */
  otherTeam: string | null
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
  not_member: 'ההזמנה כבר לא בתוקף, או שאתה כבר לא בקבוצה',
  bad_name: 'שם הקבוצה צריך להיות 2–40 תווים',
  offensive_name: 'שם הקבוצה מכיל מילה לא ראויה. נסה שם אחר',
  banned: BANNED_HE,
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

/** Most device keys a group message is wrapped for per fan: 20 fans × 3 = 60, the database cap. */
export const DEVICES_PER_FAN = 3

/**
 * Which devices a group message is wrapped for: each fan's newest `perUser` devices, so old keys that
 * were never pruned cannot push a group over the cap. `mustInclude` (this device) is always kept.
 */
export function pickDevices<T extends { user_id: string; id: string; created_at: string }>(
  devices: T[],
  perUser: number,
  mustInclude: { user_id: string; id: string },
): T[] {
  const byUser = new Map<string, T[]>()
  for (const d of devices) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d])
  const out: T[] = []
  for (const [user, list] of byUser) {
    const newest = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (user !== mustInclude.user_id) {
      out.push(...newest.slice(0, perUser))
      continue
    }
    const mine = newest.find((d) => d.id === mustInclude.id)
    const rest = newest.filter((d) => d.id !== mustInclude.id)
    out.push(...(mine ? [mine, ...rest.slice(0, perUser - 1)] : rest.slice(0, perUser)))
  }
  return out
}

// ---------- league-wide private messages, requests and the QR code (2026-10-16) ----------

export type RequestSide = 'incoming' | 'outgoing' | null

/** A thread is a request while it is not accepted; threads from before the change have no opener and are accepted. */
export function requestOf(t: { accepted_at: string | null; opened_by: string | null }, meId: string): RequestSide {
  if (t.accepted_at || !t.opened_by) return null
  return t.opened_by === meId ? 'outgoing' : 'incoming'
}

/** What the thread screen shows: the recipient decides; the opener may send one message, then waits. */
export type RequestState = 'open' | 'waiting' | 'decide'
export function requestState({ request, sentByMe }: { request: RequestSide; sentByMe: number }): RequestState {
  if (request === 'incoming') return 'decide'
  if (request === 'outgoing' && sentByMe > 0) return 'waiting'
  return 'open'
}

/** Incoming requests go to the "בקשות" section; everything else stays in the list, order kept. */
export function splitRequests(rows: InboxRow[]): { requests: InboxRow[]; rows: InboxRow[] } {
  const requests: InboxRow[] = []
  const rest: InboxRow[] = []
  for (const r of rows) (r.kind === 'dm' && r.request === 'incoming' ? requests : rest).push(r)
  return { requests, rows: rest }
}

export const DM_REQUEST_OPTIONS = [
  { value: 'everyone', label: 'כולם' },
  { value: 'team', label: 'רק אוהדי הקבוצה שלי' },
  { value: 'qr', label: 'רק דרך ברקוד' },
] as const
export type DmRequests = (typeof DM_REQUEST_OPTIONS)[number]['value']

export const dmRequestsSchema = z.object({ value: z.enum(['everyone', 'team', 'qr']) })
export const threadIdSchema = z.object({ threadId: z.uuid() })
export const QR_CODE_RE = /^[A-Za-z0-9_-]{22,64}$/
export const qrCodeSchema = z.object({ code: z.string().regex(QR_CODE_RE) })

/** What the personal QR code encodes: the add page of this site (a random code, never the user id). */
export function qrUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/add/${code}`
}

const DM_CODES = ['requests_closed', 'awaiting_accept', 'rate_limit', 'bad_code', 'no_birth_date', 'blocked', 'banned', 'self', 'not_member', 'not_allowed'] as const

const DM_ERRORS: Record<string, string> = {
  requests_closed: 'האוהד הזה מקבל הודעות רק מאוהדי הקבוצה שלו או דרך ברקוד',
  awaiting_accept: 'ההודעה נשלחה. אפשר לכתוב שוב כשיאשרו',
  rate_limit: 'שלחת הרבה בקשות היום. נסה מחר',
  bad_code: 'הברקוד לא תקף',
  no_birth_date: 'צריך להשלים תאריך לידה',
  blocked: 'אי אפשר לפתוח שיחה עם האוהד הזה',
  banned: BANNED_HE,
  self: 'זה הברקוד שלך',
  not_member: 'השיחה כבר לא זמינה',
  not_allowed: 'רק מי שקיבל את הבקשה יכול לאשר אותה',
}

/** The code inside a database error message ('' for anything else). */
export function dmCode(message: string | undefined | null): string {
  const m = message ?? ''
  return DM_CODES.find((c) => m.includes(c)) ?? ''
}

/** Hebrew for a refusal of the private-message rules in the database. */
export function dmErrorHe(code: string): string {
  return DM_ERRORS[code] ?? 'פתיחת השיחה נכשלה. נסה שוב'
}
