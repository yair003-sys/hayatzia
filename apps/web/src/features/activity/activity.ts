// Activity bell ("התראות"): pure helpers shared by the bell, the list, the trip pushes and the in-app banner.
// Copy is exactly the spec's (docs/superpowers/specs/2026-10-14-activity-bell-design.md).
import { z } from 'zod'

export const ACTIVITY_KINDS = ['clip_like', 'photo_like', 'trip_request', 'trip_accepted'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export type TripKind = Extract<ActivityKind, 'trip_request' | 'trip_accepted'>

/** Rows per page of the list (keyset). */
export const ACTIVITY_PAGE = 30

/** Window event the list fires after the fan's visit is recorded, so the bell clears without a reload. */
export const ACTIVITY_SEEN_EVENT = 'hayatzia:activity-seen'

/** A deleted account, or one we may not name: the app's usual stand-in. */
const who = (nick: string | null | undefined) => nick?.trim() || 'אוהד'

export const tripRequestLine = (nick: string | null | undefined) => `${who(nick)} ביקש להצטרף לנסיעה שלך`
export const tripAcceptedLine = (nick: string | null | undefined) => `אושרת! הצטרפת לנסיעה של ${who(nick)}`

/** One row's sentence. `count` = fans who liked (the shown one included); trip rows are always one fan. */
export function activityLine({ kind, nick, count }: { kind: ActivityKind; nick: string | null | undefined; count: number }): string {
  switch (kind) {
    case 'clip_like':
    case 'photo_like': {
      const what = kind === 'clip_like' ? 'הסרטון שלך' : 'התמונה שלך'
      const others = Math.max(count, 1) - 1
      return others > 0 ? `${who(nick)} ועוד ${others} אהבו את ${what}` : `${who(nick)} אהב את ${what}`
    }
    case 'trip_request':
      return tripRequestLine(nick)
    case 'trip_accepted':
      return tripAcceptedLine(nick)
  }
}

/** The red badge: hidden at 0; the database caps the count at 100, shown as "99+". */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null
  return count >= 100 ? '99+' : String(count)
}

export function bellLabel(count: number): string {
  const b = badgeLabel(count)
  return b ? `התראות, ${b} חדשות` : 'התראות'
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "לפני 5 דק׳". `nowMs` comes from the caller (never read the clock while rendering). */
export function relativeTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = nowMs - t
  if (d < MIN) return 'עכשיו'
  if (d < HOUR) return `לפני ${Math.floor(d / MIN)} דק׳`
  if (d < DAY) return `לפני ${Math.floor(d / HOUR)} שע׳`
  if (d < 2 * DAY) return 'אתמול'
  return `לפני ${Math.floor(d / DAY)} ימים`
}

/** Changed after the fan's last visit (no visit yet → everything is new). */
export function isUnseen(updatedAt: string, seenAt: string | null | undefined): boolean {
  if (!seenAt) return true
  return Date.parse(updatedAt) > Date.parse(seenAt)
}

// ---------- keyset cursor: (updated_at, id) of the last row shown ----------
export type Cursor = { updatedAt: string; id: number }

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/

const toB64Url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function encodeCursor(c: Cursor): string {
  return toB64Url(`${c.updatedAt}|${c.id}`)
}

/** Back from the client: only a well-formed timestamp and a positive integer id (they go into a filter). */
export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s || s.length > 120) return null
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bar = raw.lastIndexOf('|')
    const updatedAt = raw.slice(0, bar)
    const id = raw.slice(bar + 1)
    if (bar < 0 || !TS.test(updatedAt) || !/^[1-9]\d{0,17}$/.test(id) || Number.isNaN(Date.parse(updatedAt))) return null
    return { updatedAt, id: Number(id) }
  } catch {
    return null
  }
}

// ---------- where a row (or a push, or a banner) leads ----------
/** There is no single-trip screen: the trips board opens on that trip's match and scrolls to it. */
export const tripHref = (tripId: string) => `/stand/trips?trip=${tripId}`

/**
 * There is no single-post screen in the Square: a clip opens its tab (league or club); a stand photo opens the club
 * tab, which replaced "תמונות מהיציע" (/stand/photos redirects there).
 */
export function activityHref(a: { kind: ActivityKind; tripId: string | null; clipAudience: string | null }): string {
  switch (a.kind) {
    case 'trip_request':
    case 'trip_accepted':
      return a.tripId ? tripHref(a.tripId) : '/stand/trips'
    case 'clip_like':
      return a.clipAudience === 'team' ? '/square?f=team' : '/square'
    case 'photo_like':
      return '/square?f=team'
  }
}

const activityPayload = z.object({ kind: z.enum(ACTIVITY_KINDS) })

/** The `activity` broadcast on `inbox:<me>`: the kind only (ids-only rule), or null for anything else. */
export function parseActivityEvent(event: string, payload: unknown): ActivityKind | null {
  if (event !== 'activity') return null
  const p = activityPayload.safeParse(payload)
  return p.success ? p.data.kind : null
}

export const isActivityKind = (k: string): k is ActivityKind => (ACTIVITY_KINDS as readonly string[]).includes(k)

type Keyed = { id: number; updatedAt: string }

/** Newest first: (updated_at desc, id desc), the list's keyset order. */
const newerFirst = (a: Keyed, b: Keyed) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id - a.id

/**
 * A refreshed first page over what is already on screen (pages loaded with "עוד" included), so a live refresh never
 * drops loaded pages. The first page is a contiguous slice from the top: within it, it is the truth (changed rows
 * move up, removed rows go); older rows already held are kept. `complete`: the first page is the whole list.
 */
export function mergeItems<T extends Keyed>(fresh: readonly T[], held: readonly T[], complete: boolean): T[] {
  if (complete) return [...fresh]
  const last = fresh[fresh.length - 1]
  if (!last) return [...held]
  const ids = new Set(fresh.map((f) => f.id))
  const older = held.filter((h) => !ids.has(h.id) && newerFirst(last, h) < 0)
  return [...fresh, ...older].sort(newerFirst)
}
