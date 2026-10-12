import { DONE_STATUSES, LIVE_STATUSES, type Fixture } from './schema'

export type Round = { key: string; fixtures: Fixture[]; firstKickoff: number }

/** Groups fixtures by round, in kick-off order. Pure: safe inside cached functions. */
export function groupByRound(fixtures: readonly Fixture[]): Round[] {
  const map = new Map<string, Fixture[]>()
  for (const f of [...fixtures].sort((a, b) => a.t - b.t)) {
    const list = map.get(f.r)
    if (list) list.push(f)
    else map.set(f.r, [f])
  }
  return [...map.entries()].map(([key, list]) => ({ key, fixtures: list, firstKickoff: list[0]?.t ?? 0 }))
}

/** The round to open by default: a live round, else the first with unplayed games, else the last. */
export function currentRoundIndex(rounds: readonly Round[]): number {
  const live = rounds.findIndex((r) => r.fixtures.some((f) => LIVE_STATUSES.has(f.st)))
  if (live >= 0) return live
  const open = rounds.findIndex((r) => r.fixtures.some((f) => !DONE_STATUSES.has(f.st)))
  if (open >= 0) return open
  return Math.max(0, rounds.length - 1)
}

/** For predictions: the round of the next match that has not kicked off yet (stale unplayed matches don't count). */
export function predictRoundIndex(rounds: readonly Round[], nowMs: number): number {
  let best = -1
  let bestT = Infinity
  rounds.forEach((r, i) => {
    for (const f of r.fixtures) {
      if (f.t * 1000 > nowMs && !DONE_STATUSES.has(f.st) && f.t < bestT) {
        best = i
        bestT = f.t
      }
    }
  })
  return best >= 0 ? best : currentRoundIndex(rounds)
}
