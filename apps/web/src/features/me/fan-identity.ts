// Algorithm phase 2: the fan's identity label, derived from what they actually do. Deterministic, from existing
// signals — stadium check-ins (a die-hard), match ratings + exact predictions (a tactician), clips posted (a creator).
// The dominant activity wins, once it clears a small floor so a brand-new fan has no label yet (and something to earn).

export const FAN_LABELS = {
  diehard: { key: 'diehard', label: 'אוהד שרוף', emoji: '🔥' },
  tactician: { key: 'tactician', label: 'טקטיקן', emoji: '🧠' },
  creator: { key: 'creator', label: 'יוצר תוכן', emoji: '🎬' },
} as const

export type FanLabel = (typeof FAN_LABELS)[keyof typeof FAN_LABELS]

/** A fan earns a label only after this much activity in a dimension. */
export const FAN_LABEL_MIN = 3

export function fanLabel(s: { games: number; tactical: number; uploads: number }): FanLabel | null {
  // Order is the tie-break priority (die-hard > tactician > creator) when two dimensions are equal.
  const ranked: Array<readonly [number, FanLabel]> = [
    [s.games, FAN_LABELS.diehard],
    [s.tactical, FAN_LABELS.tactician],
    [s.uploads, FAN_LABELS.creator],
  ]
  ranked.sort((a, b) => b[0] - a[0])
  const top = ranked[0]
  return top && top[0] >= FAN_LABEL_MIN ? top[1] : null
}
