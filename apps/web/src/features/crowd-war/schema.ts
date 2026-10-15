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

/** Relative luminance of a #rrggbb colour (0 black … 1 white). */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return 0
  const n = Number.parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/**
 * The two crowds' bar colours: each club's bar colour. When both clubs share it, one side takes its second colour:
 * the away side, unless that colour is too dark to see on the dark canvas (then the home side; white as a last resort).
 */
export function warColours(home: Colours, away: Colours): { home: string; away: string } {
  if (home.bar.toLowerCase() !== away.bar.toLowerCase()) return { home: home.bar, away: away.bar }
  const visible = (c: string) => luminance(c) > 0.03 && c.toLowerCase() !== home.bar.toLowerCase()
  if (visible(away.ring)) return { home: home.bar, away: away.ring }
  if (visible(home.ring)) return { home: home.ring, away: away.bar }
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
