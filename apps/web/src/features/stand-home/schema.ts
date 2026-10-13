// Stand home ("היציע שלי"): pure helpers ported from the legacy home tab (index.html).
import { DONE_STATUSES, LIVE_STATUSES, type Fixture } from '@/features/matches/schema'

const MIN = 60_000
const MATCH_MIN = 110 // 90′ + break + stoppage, as the match rooms use
const ROOM_CLOSE_MIN = 170

// ── team accent (legacy teamColors, index.html L3133) ─────────────────────────────────────
type Rgb = [number, number, number]
const BG: Rgb = [7, 9, 13]
const WHITE: Rgb = [255, 255, 255]
const DARK: Rgb = [11, 13, 18]
const toRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const lin = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = (c: Rgb) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const contrast = (a: Rgb, b: Rgb) => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb
const toHex = (c: Rgb) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')

export type TeamAccent = { accent: string; accent2: string; rgb: string; text: string; on: string }

/** The club's colour made readable on the dark page: fills ≥ 3.2:1, text ≥ 4.8:1. */
export function teamAccent(bar: string): TeamAccent {
  const base = toRgb(bar)
  let btn = base
  for (let k = 1; contrast(btn, BG) < 3.2 && k <= 12; k++) btn = mix(base, WHITE, k * 0.08)
  let text = btn
  for (let k = 1; contrast(text, BG) < 4.8 && k <= 12; k++) text = mix(btn, WHITE, k * 0.08)
  const on = contrast(WHITE, btn) >= contrast(DARK, btn) ? WHITE : DARK
  return { accent: toHex(btn), accent2: toHex(mix(btn, WHITE, 0.18)), rgb: btn.join(' '), text: toHex(text), on: toHex(on) }
}

// ── match-day ticket ─────────────────────────────────────────────────────────────────────
const elapsedMin = (f: Fixture, nowMs: number) => (nowMs - f.t * 1000) / MIN

// A "live" status from the data is trusted only within the room's window (extra time fits); after that it is stale.
function isLive(f: Fixture, nowMs: number): boolean {
  const e = elapsedMin(f, nowMs)
  if (DONE_STATUSES.has(f.st) || e < 0) return false
  return e < MATCH_MIN || (LIVE_STATUSES.has(f.st) && e < ROOM_CLOSE_MIN)
}

/** Minute shown on the ticket: estimated from kick-off like the legacy app; the data wins for HT and full time. */
export function minuteLabel(f: Fixture, nowMs: number): string {
  if (DONE_STATUSES.has(f.st)) return 'הסתיים'
  if (f.st === 'HT') return 'מחצית'
  // Extra time and penalties run past the 110′ cutoff: the data wins, so a game still being played never reads "הסתיים".
  if (f.st === 'ET') return 'הארכה'
  if (f.st === 'BT') return 'הפסקה בהארכה'
  if (f.st === 'P') return 'פנדלים'
  const e = elapsedMin(f, nowMs)
  if (e < 0) return ''
  if (e >= MATCH_MIN) return 'הסתיים'
  if (e <= 45) return `${Math.max(1, Math.ceil(e))}'`
  if (e < 60) return 'מחצית'
  const m = Math.ceil(e - 15)
  return m > 90 ? '90+' : `${m}'`
}

/** Live → just finished while its room is open → next → last finished. */
export function pickTicket(fixtures: Fixture[], clubApiIds: number[], nowMs: number): Fixture | null {
  const mine = fixtures.filter((f) => clubApiIds.includes(f.h) || clubApiIds.includes(f.a)).sort((a, b) => a.t - b.t)
  const live = mine.find((f) => isLive(f, nowMs))
  if (live) return live
  const started = mine.filter((f) => f.t * 1000 <= nowMs)
  const justDone = started.filter((f) => nowMs < f.t * 1000 + ROOM_CLOSE_MIN * MIN).at(-1)
  if (justDone) return justDone
  const next = mine.find((f) => f.t * 1000 > nowMs && !DONE_STATUSES.has(f.st))
  return next ?? started.at(-1) ?? null
}

export function isTicketLive(f: Fixture, nowMs: number): boolean {
  return isLive(f, nowMs)
}

/** "5 דק׳", "1:05 ש׳", or "דקה" for under a minute. */
export function untilLabel(ms: number): string {
  const m = Math.ceil(ms / MIN)
  if (m <= 1) return 'דקה'
  if (m < 60) return `${m} דק׳`
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ש׳`
}

// ── presence, pitch ──────────────────────────────────────────────────────────────────────
/** Distinct fans in a Realtime presence state (one fan with two tabs counts once). */
export function countUsers(state: Record<string, { user_id?: string }[]>): number {
  const ids = new Set<string>()
  for (const [key, metas] of Object.entries(state)) for (const m of metas) ids.add(m.user_id ?? key)
  return ids.size
}

export function cardTier(avg: number | null): 'gold' | 'silver' | 'bronze' {
  if (avg === null) return 'bronze'
  return avg >= 4.2 ? 'gold' : avg >= 3.4 ? 'silver' : 'bronze'
}

/** XI players that have a pitch position go on the pitch; everyone else sits on the bench. */
export function splitPitch<T extends { in_xi: boolean; pitch_x: number | null; pitch_y: number | null }>(
  players: T[],
): { xi: T[]; bench: T[] } {
  const onPitch = (p: T) => p.in_xi && p.pitch_x !== null && p.pitch_y !== null
  return { xi: players.filter(onPitch), bench: players.filter((p) => !onPitch(p)) }
}
