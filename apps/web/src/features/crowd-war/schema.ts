// Crowd war ("מלחמת הקהלים", spec 2026-10-15): pure rules shared by the UI and its tests. The database counts the
// points (migration 20261015140000_crowd_war); these helpers mirror its rules for display only.

export const WAR_WINDOW_HOURS = 48
export const CHAT_CAP = 20
export const POST_CAP = 3
export const POINTS = { chat: 1, post: 5, prediction: 5, lineup: 5 } as const
/** The most one fan can give their club in one war (20 + 15 + 5 + 5). */
export const MAX_FAN_POINTS = CHAT_CAP * POINTS.chat + POST_CAP * POINTS.post + POINTS.prediction + POINTS.lineup

export const HOW_TO_EARN = `הודעה ${POINTS.chat} · פוסט ${POINTS.post} · ניחוש ${POINTS.prediction} · הרכב ${POINTS.lineup}`

export type FanCounters = { chat: number; posts: number; predicted: boolean; lineup: boolean }

/** A fan's points for one war from their counters, with the same caps as the database. */
export function fanPoints(c: FanCounters): number {
  const chat = Math.min(Math.max(c.chat, 0), CHAT_CAP)
  const posts = Math.min(Math.max(c.posts, 0), POST_CAP)
  return chat * POINTS.chat + posts * POINTS.post + (c.predicted ? POINTS.prediction : 0) + (c.lineup ? POINTS.lineup : 0)
}

export type WarPhase = 'soon' | 'open' | 'final'

/** Before the window ('soon'), during the 48 hours before kick-off ('open'), from kick-off on ('final'). */
export function warPhase(kickoffSec: number, nowMs: number): WarPhase {
  const kickoffMs = kickoffSec * 1000
  if (nowMs >= kickoffMs) return 'final'
  if (nowMs < kickoffMs - WAR_WINDOW_HOURS * 3600_000) return 'soon'
  return 'open'
}

export type WarOutcome = 'home' | 'away' | 'draw' | 'none'

/** Who won: 'none' when neither crowd scored, 'draw' on equal points. */
export function warOutcome(home: number, away: number): WarOutcome {
  if (home <= 0 && away <= 0) return 'none'
  if (home === away) return 'draw'
  return home > away ? 'home' : 'away'
}

/**
 * Whole percentages that add up to 100. 0–0 is an even 50–50 bar. A crowd with points never shows 0%, and the
 * crowd ahead never shows an equal share (so "won 50–50" cannot happen).
 */
export function warSplit(home: number, away: number): { home: number; away: number } {
  const h = Math.max(home, 0)
  const a = Math.max(away, 0)
  if (h + a === 0) return { home: 50, away: 50 }
  let pct = Math.round((h / (h + a)) * 100)
  if (h > 0 && a > 0) pct = Math.min(Math.max(pct, 1), 99)
  if (h > a && pct <= 50) pct = 51
  if (a > h && pct >= 50) pct = 49
  return { home: pct, away: 100 - pct }
}

type Colours = { bar: string; ring: string }

/** The bar's empty track (--color-surface-3): a fallback colour must stand out against it. */
export const WAR_TRACK = '#1d263b'
/** Neutral grey for when neither club has a usable second colour (5:1 on the track). */
export const WAR_NEUTRAL = '#8C96A8'
/** Below this "redmean" RGB distance two bar colours read as the same (red vs red, yellow vs yellow). */
export const SAME_COLOUR_DISTANCE = 120
/** WCAG non-text contrast for a fallback colour against the track. */
export const MIN_TRACK_CONTRAST = 3

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const n = m?.[1] ? Number.parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Relative luminance of a #rrggbb colour (0 black … 1 white). */
function luminance(hex: string): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio of two colours (1 … 21). */
export function contrast(a: string, b: string): number {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Perceptual-ish distance of two colours ("redmean" weighted RGB, 0 … ~765). */
export function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const rm = (r1 + r2) / 2
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2)
}

/**
 * The two crowds' bar colours: each club's bar colour. When the two look alike (close in colour, not only equal), one
 * side switches: the away side's second colour, else the home side's second colour, else a neutral grey, else white.
 * A replacement is used only with at least 3:1 against the track and clearly different from the other side.
 */
export function warColours(home: Colours, away: Colours): { home: string; away: string } {
  if (colourDistance(home.bar, away.bar) >= SAME_COLOUR_DISTANCE) return { home: home.bar, away: away.bar }
  const usable = (c: string, other: string) =>
    contrast(c, WAR_TRACK) >= MIN_TRACK_CONTRAST && colourDistance(c, other) >= SAME_COLOUR_DISTANCE
  if (usable(away.ring, home.bar)) return { home: home.bar, away: away.ring }
  if (usable(home.ring, away.bar)) return { home: home.ring, away: away.bar }
  if (usable(WAR_NEUTRAL, home.bar)) return { home: home.bar, away: WAR_NEUTRAL }
  return { home: home.bar, away: '#ffffff' }
}

/** "תרמת N נקודות" for the fan's own share. */
export function contributedLine(points: number): string {
  if (points <= 0) return 'עוד לא תרמת נקודות'
  if (points === 1) return 'תרמת נקודה אחת'
  return `תרמת ${points.toLocaleString('he-IL')} נקודות`
}

/** The frozen result: "הקהל של X ניצח 64–36", or "תיקו בין הקהלים"; null when neither crowd scored. */
export function resultLine(homeName: string, awayName: string, home: number, away: number): string | null {
  const outcome = warOutcome(home, away)
  if (outcome === 'none') return null
  if (outcome === 'draw') return 'תיקו בין הקהלים'
  const split = warSplit(home, away)
  return outcome === 'home'
    ? `הקהל של ${homeName} ניצח ${split.home}–${split.away}`
    : `הקהל של ${awayName} ניצח ${split.away}–${split.home}`
}

/** "מלחמות קהלים העונה: 5 ניצחונות · 2 הפסדים" (a draw count only when there were draws). */
export function recordLine(r: { wins: number; losses: number; draws: number }): string {
  const wins = r.wins === 1 ? 'ניצחון אחד' : `${r.wins} ניצחונות`
  const losses = r.losses === 1 ? 'הפסד אחד' : `${r.losses} הפסדים`
  const draws = r.draws > 0 ? ` · ${r.draws === 1 ? 'תיקו אחד' : `${r.draws} תיקו`}` : ''
  return `מלחמות קהלים העונה: ${wins} · ${losses}${draws}`
}
