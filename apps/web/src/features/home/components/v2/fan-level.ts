/**
 * A fan's display level, derived from their real prediction points (owner home-redesign 2026-11-27). There is no stored
 * "level" field, and the spec forbids inventing a number — so this is a pure, deterministic curve over the points the
 * fan actually earned (prediction_totals.points), shown as "Lv.N". ~12.5k points → Lv.8, matching the mockup.
 */
export function fanLevel(points: number): number {
  if (points <= 0) return 1
  return Math.max(1, Math.min(99, Math.round(Math.log2(points / 50 + 1))))
}
