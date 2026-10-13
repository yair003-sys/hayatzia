// Live-centre helpers: Israel day buckets, the 7-day strip, live-now selection, line-up pitch, crest initials.
// Pure (no "now" inside): callers pass the clock, so these are safe in cached server components and in tests.
import { isTicketLive } from '@/features/stand-home/schema'
import { currentRoundIndex, groupByRound } from './rounds'
import type { Fixture } from './schema'
import type { RoomState } from '@/features/match-room/schema'

const TZ = 'Asia/Jerusalem'
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const WEEKDAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const
const DAY_MS = 86_400_000

/** Israel calendar date of a unix time, as `YYYY-MM-DD` (a 23:30 kick-off stays on its Israel date). */
export function israelDayKey(unixSeconds: number): string {
  const parts = dayKeyFmt.formatToParts(new Date(unixSeconds * 1000))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Calendar arithmetic on the key itself (UTC noon avoids any DST edge).
const keyToUtc = (key: string) => Date.parse(`${key}T12:00:00Z`)
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export type StripDay = { key: string; weekday: string; day: number; hasGames: boolean; today: boolean }

/** Seven days in date order, today at index 3; RTL rendering puts the earliest day on the right. */
export function dayStrip(todayKey: string, fixtures: Fixture[]): StripDay[] {
  const withGames = new Set(fixtures.map((f) => israelDayKey(f.t)))
  const base = keyToUtc(todayKey)
  return [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const d = new Date(base + offset * DAY_MS)
    const key = utcToKey(d.getTime())
    return {
      key,
      weekday: WEEKDAYS_HE[d.getUTCDay()]!,
      day: d.getUTCDate(),
      hasGames: withGames.has(key),
      today: offset === 0,
    }
  })
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A `?d=` value as a real calendar day key, or null (junk, "2026-02-30", arrays). */
export function parseDayKey(v: unknown): string | null {
  if (typeof v !== 'string' || !DAY_KEY_RE.test(v)) return null
  const ms = keyToUtc(v)
  return Number.isNaN(ms) || utcToKey(ms) !== v ? null : v
}

/** Centre of the strip: today, unless its week has no games; then the current round's first match day. */
export function stripCentre(todayKey: string, fixtures: Fixture[]): string {
  if (dayStrip(todayKey, fixtures).some((d) => d.hasGames)) return todayKey
  const rounds = groupByRound(fixtures)
  const first = rounds[currentRoundIndex(rounds)]?.fixtures[0]
  return first ? israelDayKey(first.t) : todayKey
}

/** The Matches page's strip centre and selected day; a `?d=` outside the strip re-centres the strip on it. */
export function pickDay(todayKey: string, fixtures: Fixture[], param: unknown): { centre: string; selected: string } {
  const centre = stripCentre(todayKey, fixtures)
  const wanted = parseDayKey(param)
  if (!wanted) return { centre, selected: centre }
  const inStrip = dayStrip(centre, []).some((d) => d.key === wanted)
  return { centre: inStrip ? centre : wanted, selected: wanted }
}

/** That Israel day's fixtures, by kick-off. */
export function fixturesOn(dayKey: string, fixtures: Fixture[]): Fixture[] {
  return fixtures.filter((f) => israelDayKey(f.t) === dayKey).sort((a, b) => a.t - b.t)
}

/** Fixtures live right now, by the same rule as the match-day ticket (stale statuses after 170′ are not live). */
export function liveNow(fixtures: Fixture[], nowMs: number): Fixture[] {
  return fixtures.filter((f) => isTicketLive(f, nowMs)).sort((a, b) => a.t - b.t)
}

export type LineupEntry = { n: number | null; p: string; pos: string; g: string | null }
/** `x`: percent from the left; `y`: percent from the bottom of a vertical half-pitch (goalkeeper at the bottom). */
export type PitchSpot = { n: number | null; name: string; x: number; y: number }

const GK_Y = 8
const TOP_Y = 88
const round2 = (v: number) => Math.round(v * 100) / 100

/** Provider grid "row:col" (row 1 = goalkeeper) → pitch coordinates; null when any grid is missing or malformed. */
export function pitchSpots(xi: LineupEntry[]): PitchSpot[] | null {
  if (xi.length === 0) return null
  const cells: { row: number; col: number }[] = []
  for (const pl of xi) {
    const m = pl.g ? /^(\d+):(\d+)$/.exec(pl.g) : null
    if (!m) return null
    const row = Number(m[1])
    const col = Number(m[2])
    if (row < 1 || col < 1) return null
    cells.push({ row, col })
  }
  const rows = Math.max(...cells.map((c) => c.row))
  const colsInRow = new Map<number, number>()
  for (const c of cells) colsInRow.set(c.row, Math.max(colsInRow.get(c.row) ?? 0, c.col))
  return xi.map((pl, i) => {
    const { row, col } = cells[i]!
    const cols = colsInRow.get(row)!
    const y = rows === 1 ? GK_Y : GK_Y + ((row - 1) * (TOP_Y - GK_Y)) / (rows - 1)
    return { n: pl.n, name: pl.p, x: round2(((col - 0.5) / cols) * 100), y: round2(y) }
  })
}

/** Up to two initials for a crest disc: "מכבי ת״א" → "מת". Gershayim, geresh, quotes and dots are dropped. */
export function initials(name: string): string {
  return name
    .replace(/[״׳"'.]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

/** Score as "away : home" for an LTR number inside an RTL row, so each club's goals sit on its own side. */
export function sideScore(f: Pick<Fixture, 'gh' | 'ga'>): string {
  return `${f.ga ?? 0} : ${f.gh ?? 0}`
}

export type MatchTab = 'game' | 'lineup' | 'room'
const TABS: readonly MatchTab[] = ['game', 'lineup', 'room']

/** The match page's tab: a valid `?tab=` wins; otherwise the room while it is open or closing, else the game. */
export function pickTab(param: unknown, room: RoomState): MatchTab {
  if (typeof param === 'string' && (TABS as readonly string[]).includes(param)) return param as MatchTab
  return room === 'open' || room === 'closing' ? 'room' : 'game'
}
