// Chat essentials shared by the four chat screens (club chat, match room, private messages, groups): day separators,
// the last-read marker and its unread divider, send ticks and reply snippets. Pure helpers, unit-tested; the only
// browser access (localStorage) is wrapped so a blocked storage never breaks a chat.

const TZ = 'Asia/Jerusalem'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const dayYearFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })

/** Calendar day in Israel, "2026-10-15". */
export function dayKey(at: string | number | Date): string {
  return dayKeyFmt.format(new Date(at))
}

/** True when `iso` starts a new Israel day after `prevIso` (always true for the first item). */
export function startsNewDay(prevIso: string | undefined, iso: string): boolean {
  return prevIso === undefined || dayKey(prevIso) !== dayKey(iso)
}

/**
 * Label of a day separator: "היום", "אתמול", otherwise the date ("יום שני, 12 באוקטובר"; with the year when it is not
 * this year). Without `nowMs` (before the page knows the clock), always the date.
 */
export function dayLabel(iso: string, nowMs: number | null): string {
  if (nowMs !== null) {
    const day = dayKey(iso)
    if (day === dayKey(nowMs)) return 'היום'
    // Noon of today minus a day is always yesterday, whatever the daylight-saving change.
    const today = dayKey(nowMs)
    const yesterday = dayKey(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    if (day === yesterday) return 'אתמול'
    if (day.slice(0, 4) === today.slice(0, 4)) return dayFmt.format(new Date(iso))
  }
  return dayYearFmt.format(new Date(iso))
}

// ---------- last-read marker ----------

/** The last message the fan saw in a chat, kept on the device. */
export type ReadMark = { id: string; at: string }

type Ordered = { id: string; created_at: string }

/** Chat order: by time, then by id (the same order as the lists and their keyset cursors). */
export function isAfter(m: Ordered, mark: ReadMark): boolean {
  // Parsed, not compared as text: the database writes "+00:00", the browser "Z".
  const a = Date.parse(m.created_at)
  const b = Date.parse(mark.at)
  return a === b ? m.id > mark.id : a > b
}

/**
 * Where the unread divider goes: the first message after the mark written by someone else, and how many such
 * messages there are. A message of mine after the mark means I read everything before it, so only messages after my
 * last one count. `more` is true when the mark is older than everything loaded (there may be more unread above).
 * No mark (first visit) or nothing new → index -1.
 */
export function unreadFrom<T extends Ordered>(
  messages: readonly T[],
  mark: ReadMark | null,
  isMine: (m: T) => boolean,
): { index: number; count: number; more: boolean } {
  const none = { index: -1, count: 0, more: false }
  if (!mark) return none
  let start = messages.findIndex((m) => isAfter(m, mark))
  if (start < 0) return none
  for (let i = messages.length - 1; i >= start; i--) {
    if (isMine(messages[i] as T)) {
      start = i + 1
      break
    }
  }
  let index = -1
  let count = 0
  for (let i = start; i < messages.length; i++) {
    if (isMine(messages[i] as T)) continue
    if (index < 0) index = i
    count++
  }
  if (index < 0) return none
  const first = messages[0]
  const more = start === 0 && first !== undefined && isAfter(first, mark) && !messages.some((m) => m.id === mark.id)
  return { index, count, more }
}

/** "הודעה אחת שלא נקראה", "5 הודעות שלא נקראו", "50+ הודעות שלא נקראו". */
export function unreadDividerLabel(count: number, more = false): string {
  if (count === 1 && !more) return 'הודעה אחת שלא נקראה'
  return `${count.toLocaleString('he-IL')}${more ? '+' : ''} הודעות שלא נקראו`
}

/** The newer of two marks (a mark never moves backwards). */
export function laterMark(a: ReadMark | null, b: ReadMark | null): ReadMark | null {
  if (!a) return b
  if (!b) return a
  return isAfter({ id: b.id, created_at: b.at }, a) ? b : a
}

const MARK_PREFIX = 'hy-read:'

/** Reads the mark of a chat; null when there is none, it is malformed, or storage is blocked. */
export function loadMark(chat: string): ReadMark | null {
  try {
    const raw = window.localStorage.getItem(MARK_PREFIX + chat)
    if (!raw) return null
    const v = JSON.parse(raw) as { id?: unknown; at?: unknown }
    return typeof v.id === 'string' && typeof v.at === 'string' ? { id: v.id, at: v.at } : null
  } catch {
    return null
  }
}

/** Saves the mark when it is newer than the stored one. Silently does nothing when storage is blocked. */
export function saveMark(chat: string, mark: ReadMark): void {
  try {
    const next = laterMark(loadMark(chat), mark)
    if (next === mark) window.localStorage.setItem(MARK_PREFIX + chat, JSON.stringify(mark))
  } catch {
    // private mode / blocked storage: the chat simply opens at the end next time
  }
}

// ---------- send ticks ----------

/** Client-side state of a message: on the way, saved by the server, or failed. */
export type SendState = 'sending' | 'sent' | 'failed'

/** Prefix of ids of messages that exist only on this device until the server saves them. */
export const LOCAL_ID = 'local-'

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID)
}

/** "דווח" on a chat message: only in a public chat that allows reports, on another fan's message the server saved. */
export function canReport(m: { id: string; user_id: string }, meId: string, reportable: boolean): boolean {
  return reportable && m.user_id !== meId && !isLocalId(m.id)
}

/** A message with a server id was saved; a local one is sending or failed. */
export function sendState(m: { id: string; failed?: boolean }): SendState {
  if (!isLocalId(m.id)) return 'sent'
  return m.failed ? 'failed' : 'sending'
}

/** What the tick mark shows: one grey tick while sending, two once saved, an error mark when it failed. */
export function tickInfo(state: SendState): { ticks: 0 | 1 | 2; label: string } {
  switch (state) {
    case 'sending':
      return { ticks: 1, label: 'בשליחה' }
    case 'sent':
      return { ticks: 2, label: 'נשלח' }
    case 'failed':
      return { ticks: 0, label: 'לא נשלח' }
  }
}

// ---------- replies ----------

/** Same length as the server's snapshot (reply_body, first 80 characters). */
export const REPLY_SNIPPET_MAX = 80

/** One line of a quoted message: whitespace collapsed, at most 80 characters, "…" when cut. */
export function replySnippet(text: string, max = REPLY_SNIPPET_MAX): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() + '…' : chars.join('')
}

// ---------- my own messages on their way ----------

/**
 * Which of my "sending" copies a realtime echo of my own saved message replaces (-1: none). An echo of a message the
 * send already confirmed (its id is in `confirmed`) replaces nothing: its copy is gone, and a newer message with the
 * same text must stay. Otherwise the oldest copy still sending with the same text and the same reply.
 */
export function echoMatch<P extends { failed?: boolean; reply_to?: string | null }>(
  pending: readonly P[],
  echo: { id: string; text: string | null; reply_to?: string | null },
  confirmed: ReadonlySet<string>,
  textOf: (p: P) => string | null,
): number {
  if (confirmed.has(echo.id)) return -1
  return pending.findIndex((p) => !p.failed && textOf(p) === echo.text && (p.reply_to ?? null) === (echo.reply_to ?? null))
}

/** How a failed send ends (see SendErrorKind in ./schema). */
export type FailureKind = 'retry' | 'permanent' | 'bad_reply'

/**
 * After a failed send: a passing failure keeps the bubble with "נסה שוב"; a refused text goes back to the typing box
 * (when the box is empty) with its quote, or without it when the answered message is gone.
 */
export function failurePlan(kind: FailureKind = 'retry'): { keepBubble: boolean; restoreText: boolean; restoreQuote: boolean } {
  return { keepBubble: kind === 'retry', restoreText: kind !== 'retry', restoreQuote: kind === 'permanent' }
}
