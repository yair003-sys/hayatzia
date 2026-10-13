// In-app banner ("התראה בראש המסך"): which live events become a banner, its text and where a tap goes.
// Pure helpers; the component lives in components/alert-banner.tsx.
import { z } from 'zod'
import type { NotificationPrefs } from './schema'

export type BannerEvent =
  | { kind: 'match'; fixtureId: number; homeApiId: number; awayApiId: number }
  | { kind: 'dm'; threadId: string; from: string }
  | { kind: 'group'; groupId: string; from: string }
  | { kind: 'invite'; groupId: string }

export type BannerContext = {
  /** The current path (a query or hash, if present, is ignored). */
  pathname: string
  /** The fan's settings; none saved → the defaults (everything on). */
  prefs: NotificationPrefs | null | undefined
  /** API-Football ids of the fan's club (one club may have more than one id). */
  myClubApiIds: readonly number[]
  meId: string
}

/** Window event the settings card fires after a successful save, so the banner follows without a reload. */
export const PREFS_EVENT = 'hayatzia:notification-prefs'

/** How long a banner stays before hiding by itself. */
export const BANNER_MS = 5000

const MAX_LINE = 160

const pathOnly = (p: string) => p.replace(/[?#].*$/, '').replace(/\/+$/, '')

/** The spec's suppression rules: settings, my own messages, and the screen already showing the same thing. */
export function shouldShow(event: BannerEvent, ctx: BannerContext): boolean {
  const path = pathOnly(ctx.pathname)
  const matches = ctx.prefs?.matches ?? 'all'
  const messages = ctx.prefs?.messages ?? true
  switch (event.kind) {
    case 'match':
      if (matches === 'off') return false
      if (matches === 'team' && !ctx.myClubApiIds.some((id) => id === event.homeApiId || id === event.awayApiId)) return false
      return path !== `/matches/${event.fixtureId}`
    case 'dm':
      return messages && event.from !== ctx.meId && path !== `/inbox/${event.threadId}`
    case 'group':
      return messages && event.from !== ctx.meId && path !== `/inbox/g/${event.groupId}`
    case 'invite':
      return messages
  }
}

/** Where a tap on the banner goes. */
export function bannerHref(event: BannerEvent): string {
  switch (event.kind) {
    case 'match':
      return `/matches/${event.fixtureId}`
    case 'dm':
      return `/inbox/${event.threadId}`
    case 'group':
      return `/inbox/g/${event.groupId}`
    case 'invite':
      return '/inbox'
  }
}

/** "<nick>: <text>" (decrypted on this device), or "הודעה חדשה מ־<nick>"; groups prefix "<group> · ". */
export function messageLine({ nick, text, group }: { nick: string | null; text: string | null; group?: string | null }): string {
  const who = nick?.trim() || 'אוהד'
  const clean = text?.replace(/\s+/g, ' ').trim()
  const line = clean ? `${who}: ${clean}` : `הודעה חדשה מ־${who}`
  const full = group ? `${group} · ${line}` : line
  return full.length > MAX_LINE ? `${full.slice(0, MAX_LINE - 1)}…` : full
}

export function inviteLine(groupName: string | null | undefined): string {
  return groupName ? `הזמנה לקבוצה ${groupName}` : 'הזמנה לקבוצה חדשה'
}

const alertPayload = z.object({ id: z.number().int().positive(), fixture_id: z.number().int().positive() })

/** The `alerts` broadcast (ids and the score only; text and team names come from /api/alerts/<id>). */
export function parseAlertPayload(payload: unknown): { id: number; fixtureId: number } | null {
  const p = alertPayload.safeParse(payload)
  return p.success ? { id: p.data.id, fixtureId: p.data.fixture_id } : null
}

const uuid = z.uuid()
const dmPayload = z.object({ thread_id: uuid, from: uuid })
const groupPayload = z.object({ group_id: uuid, from: uuid })
const invitePayload = z.object({ group_id: uuid })

/** An `inbox:<me>` broadcast: 'message' {thread_id|group_id, from} or 'invite' {group_id}. Ids only, never content. */
export function parseInboxEvent(event: string, payload: unknown): BannerEvent | null {
  if (event === 'invite') {
    const p = invitePayload.safeParse(payload)
    return p.success ? { kind: 'invite', groupId: p.data.group_id } : null
  }
  if (event !== 'message') return null
  const d = dmPayload.safeParse(payload)
  if (d.success) return { kind: 'dm', threadId: d.data.thread_id, from: d.data.from }
  const g = groupPayload.safeParse(payload)
  return g.success ? { kind: 'group', groupId: g.data.group_id, from: g.data.from } : null
}

/** What /api/alerts/<id> returns: the phone notification's text plus what the banner needs to filter and colour. */
export const bannerAlertSchema = z.object({
  title: z.string(),
  body: z.string(),
  homeApiId: z.number().int(),
  awayApiId: z.number().int(),
  /** The scoring club's bar colour; null for full time or an unknown scorer (neutral brand style). */
  bar: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
})
export type BannerAlert = z.infer<typeof bannerAlertSchema>

/**
 * "Newer replaces older" across async lookups: every event gets its arrival number; a finished lookup may show only if
 * nothing that arrived later is already on screen. An older event is still shown when a newer one was filtered out.
 */
export function arrivalGate() {
  let received = 0
  let shown = 0
  return {
    /** Call when an event arrives; returns its arrival number. */
    arrive: () => ++received,
    /** Call when its lookup is done: true (and it becomes the one on screen) unless a later arrival is already shown. */
    claim: (n: number) => {
      if (n < shown) return false
      shown = n
      return true
    },
  }
}
