// Live "battle bar" momentum for the match centre: every chat message and every "push" (cheer) is a beat for one
// side. The bar reflects *recent* activity only — beats fade out of a rolling window — so a burst of noise from one
// crowd shoves the bar their way and it eases back toward the middle when they quiet down. Pure and clock-driven,
// so it can be unit-tested and recomputed on a ticker; the easing itself is a CSS width transition.

export type Side = 'h' | 'a'
export type Beat = { side: Side; at: number }

/** How long a beat keeps pushing the bar. Momentum, not a whole-match tally. */
export const BATTLE_WINDOW_MS = 90_000
/** Keep the bar from pinning fully to one end even in a one-sided burst, so both crowds always read. */
const MAX_SPLIT = 92
const MIN_SPLIT = 8

/** Drop beats older than the window (plus a small margin), newest-last order preserved. Caps memory on a long match. */
export function pruneBeats(beats: readonly Beat[], now: number): Beat[] {
  const cutoff = now - BATTLE_WINDOW_MS
  return beats.filter((b) => b.at >= cutoff)
}

/** Recent weight per side within the window: a beat at the edge of the window counts ~0, a fresh one ~1 (linear fade). */
export function sides(beats: readonly Beat[], now: number): { home: number; away: number } {
  let home = 0
  let away = 0
  for (const b of beats) {
    const age = now - b.at
    if (age < 0 || age > BATTLE_WINDOW_MS) continue
    const w = 1 - age / BATTLE_WINDOW_MS
    if (b.side === 'h') home += w
    else away += w
  }
  return { home, away }
}

/** Home's share of the bar, 0–100, clamped so neither side ever fully vanishes. Dead centre (50) when it's quiet. */
export function battleSplit(beats: readonly Beat[], now: number): number {
  const { home, away } = sides(beats, now)
  const total = home + away
  if (total <= 0) return 50
  const raw = (home / total) * 100
  return Math.round(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, raw)))
}

/** Which side has the momentum right now, or null when it's effectively even. For the little "🔥 Ⓧ מובילים" line. */
export function leader(beats: readonly Beat[], now: number): Side | null {
  const { home, away } = sides(beats, now)
  if (home <= 0 && away <= 0) return null
  if (Math.abs(home - away) < 0.5) return null
  return home > away ? 'h' : 'a'
}
