// Home ("onefan" tab, redesign 2026-10-14): pure helpers, no React, no clock of their own.
import { canBuild } from '@/features/lineup/schema'
import { DONE_STATUSES, type Fixture } from '@/features/matches/schema'

/** A review stays on a player card this long, then fades to the next most-liked one. */
export const ROTATE_MS = 4000
export const FADE_MS = 350
/** How many most-liked reviews per player rotate on the home cards. */
export const REVIEWS_PER_PLAYER = 5
/** "דרג את השחקנים" stays in the stories row this long after a finished match's kick-off. */
export const RATE_WINDOW_MS = 72 * 3600_000
export const MEDALS = ['🥇', '🥈', '🥉'] as const

// ── players' rotating reviews ─────────────────────────────────────────────────────────────
/** The review shown on card `card` at rotation `tick`: in like order, wrapping, each card one step ahead of the last. */
export function reviewIndex(tick: number, card: number, len: number): number {
  if (len <= 0) return -1
  return (tick + card) % len
}

/** Rotate only while the cards are on screen, motion is allowed, the page is visible and nobody is reading or liking. */
export function shouldRotate(s: { visible: boolean; reducedMotion: boolean; pageHidden: boolean; held: boolean }): boolean {
  return s.visible && !s.reducedMotion && !s.pageHidden && !s.held
}

// ── stories ───────────────────────────────────────────────────────────────────────────────
export type StoryClip = { id: string; user_id: string; nick: string; created_at: string; seen: boolean }
export type StoryGroup<T extends StoryClip> = {
  userId: string
  nick: string
  /** Oldest first: the order they play in. */
  clips: T[]
  /** Every clip of this fan already seen by me (grey ring). */
  seen: boolean
  /** The fan's newest clip time. */
  latest: string
}

const byLatestDesc = <T extends StoryClip>(a: StoryGroup<T>, b: StoryGroup<T>) =>
  b.latest.localeCompare(a.latest) || a.userId.localeCompare(b.userId)

/**
 * One circle per fan (never my own, never a blocked fan): fans with something new first, then the rest, each newest
 * first. A fan's clips play oldest first, like stories everywhere.
 */
export function groupStories<T extends StoryClip>(clips: T[], opts: { me: string; blocked: readonly string[]; max?: number }): StoryGroup<T>[] {
  const hidden = new Set(opts.blocked)
  const byUser = new Map<string, StoryGroup<T>>()
  for (const c of clips) {
    if (c.user_id === opts.me || hidden.has(c.user_id)) continue
    const g = byUser.get(c.user_id) ?? { userId: c.user_id, nick: c.nick, clips: [], seen: true, latest: c.created_at }
    g.clips.push(c)
    g.seen = g.seen && c.seen
    if (c.created_at > g.latest) {
      g.latest = c.created_at
      g.nick = c.nick
    }
    byUser.set(c.user_id, g)
  }
  const groups = [...byUser.values()].map((g) => ({
    ...g,
    clips: [...g.clips].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  }))
  const fresh = groups.filter((g) => !g.seen).sort(byLatestDesc)
  const seen = groups.filter((g) => g.seen).sort(byLatestDesc)
  return [...fresh, ...seen].slice(0, opts.max ?? Infinity)
}

/** Where a fan's story opens: the first clip I have not seen, or the beginning when I saw them all. */
export function storyStart<T extends StoryClip>(group: StoryGroup<T>): number {
  return Math.max(0, group.clips.findIndex((c) => !c.seen))
}

/** One playlist for the viewer (fan after fan) and, per fan, the index their circle opens at. */
export function flattenStories<T extends StoryClip>(groups: StoryGroup<T>[]): { items: { clip: T; group: number }[]; starts: number[] } {
  const items: { clip: T; group: number }[] = []
  const starts: number[] = []
  groups.forEach((g, gi) => {
    starts.push(items.length + storyStart(g))
    for (const clip of g.clips) items.push({ clip, group: gi })
  })
  return { items, starts }
}

// ── mini table ────────────────────────────────────────────────────────────────────────────
/** The club's row with the team above and the team below (three rows at the top or the bottom); [] without the club. */
export function tableWindow<T extends { team: number }>(rows: T[], clubIds: readonly number[]): T[] {
  const i = rows.findIndex((r) => clubIds.includes(r.team))
  if (i < 0) return []
  const start = Math.max(0, Math.min(i - 1, rows.length - 3))
  return rows.slice(start, start + 3)
}

// ── countdown ─────────────────────────────────────────────────────────────────────────────
export function countdownParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A day or more away: days : hours : minutes. Under a day: hours : minutes : seconds. Biggest unit first. */
export function countdownCells(ms: number): { value: string; unit: string }[] {
  const p = countdownParts(ms)
  if (p.days > 0)
    return [
      { value: String(p.days), unit: 'ימים' },
      { value: pad(p.hours), unit: 'שעות' },
      { value: pad(p.minutes), unit: 'דק׳' },
    ]
  return [
    { value: pad(p.hours), unit: 'שעות' },
    { value: pad(p.minutes), unit: 'דק׳' },
    { value: pad(p.seconds), unit: 'שנ׳' },
  ]
}

const unitHe = (n: number, one: string, two: string, many: string) => (n === 1 ? one : n === 2 ? two : `${n} ${many}`)

/** The same in words, minute precision, for screen readers: "בעוד יומיים, 3 שעות ו־14 דקות". */
export function countdownLabel(ms: number): string {
  const p = countdownParts(ms)
  const parts = [
    p.days ? unitHe(p.days, 'יום', 'יומיים', 'ימים') : '',
    p.hours ? unitHe(p.hours, 'שעה', 'שעתיים', 'שעות') : '',
    p.minutes ? unitHe(p.minutes, 'דקה', '2 דקות', 'דקות') : '',
  ].filter(Boolean)
  if (parts.length === 0) return 'בעוד פחות מדקה'
  const last = parts.pop() ?? ''
  const and = /^\d/.test(last) ? 'ו־' : 'ו'
  return `בעוד ${parts.length ? `${parts.join(', ')} ${and}${last}` : last}`
}

// ── app circles in the stories row ────────────────────────────────────────────────────────
/**
 * "ההרכב שלך": the club's next match while fans can still build a lineup for it.
 * "דרג את השחקנים": the club's latest finished match, for 3 days after its kick-off.
 */
export function homeCircles(fixtures: Fixture[], clubIds: readonly number[], nowMs: number): { lineup: Fixture | null; rate: Fixture | null } {
  const mine = fixtures.filter((f) => clubIds.includes(f.h) || clubIds.includes(f.a)).sort((a, b) => a.t - b.t)
  const lineup = mine.find((f) => canBuild(f, nowMs)) ?? null
  const rate =
    mine.filter((f) => DONE_STATUSES.has(f.st) && f.t * 1000 <= nowMs && nowMs - f.t * 1000 < RATE_WINDOW_MS).at(-1) ?? null
  return { lineup, rate }
}

/** The club's next match: the earliest one still ahead that has not been played. */
export function nextClubFixture(fixtures: Fixture[], clubIds: readonly number[], nowMs: number): Fixture | null {
  return (
    fixtures
      .filter((f) => (clubIds.includes(f.h) || clubIds.includes(f.a)) && f.t * 1000 > nowMs && !DONE_STATUSES.has(f.st))
      .sort((a, b) => a.t - b.t)[0] ?? null
  )
}

/** The first letter of a nickname, for an avatar circle. */
export function initialOf(nick: string): string {
  const ch = [...nick.trim()][0]
  return ch ? ch.toUpperCase() : '?'
}
