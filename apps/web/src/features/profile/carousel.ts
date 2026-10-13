// Club picker carousel (owner, 2026-10-13): a cover-flow of the league's clubs. Hebrew reads right to left,
// so the next club waits on the LEFT and dragging right brings it in.

export const CLUB_STEP_PX = 120
const round = (n: number) => Math.round(n * 1000) / 1000

export type ClubFrame = { transform: string; z: number; opacity: number; picked: boolean }

/** Where club `i` sits when the carousel is at `pos` (fractions while dragging). */
export function clubFrame(i: number, pos: number): ClubFrame {
  const d = i - pos
  const a = Math.max(-3, Math.min(3, d))
  const far = Math.abs(d)
  return {
    transform: `translateX(${round(-a * CLUB_STEP_PX) || 0}px) translateZ(${round(-Math.abs(a) * CLUB_STEP_PX) || 0}px) rotateY(${round(a * 38) || 0}deg)`,
    z: 100 - Math.round(far * 10),
    opacity: far > 2.6 ? 0 : round(1 - far * 0.22),
    picked: far < 0.5,
  }
}

/** Where the carousel settles when the finger lets go; `velocity` in px/ms keeps a flick going. */
export function settleClub(pos: number, velocity: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round(pos + velocity * 1.5)))
}
