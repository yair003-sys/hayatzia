// Algorithm v1 (phase 1): a clip's "hot" score. Deterministic, from signals we already have — engagement, a fast
// time-decay (football content ages fast), and a boost for the viewer's own club. No learned profile yet; that comes
// with behavioural personalisation (phase 3). Matchday boost is the next step, once a clean team→fixture link exists.

export const RANK = {
  like: 3,
  respect: 4,
  comment: 2,
  view: 0.2,
  /** Hours for engagement weight to halve. ~8h → a post keeps ~15% of its pull after a day, ~2% after two. */
  halfLifeHours: 8,
  /** The viewer's own club is multiplied by this so the feed leans ~60–70% toward their team. */
  teamBoost: 1.6,
  /** A fresh post from a club playing *right now* jumps the feed (matchday mode). */
  matchdayBoost: 3,
  /** Only posts this fresh get the matchday jump (the drama is live). */
  matchdayFreshHours: 3,
} as const

/** The fields the score needs — a loose shape so any clip row (raw or decorated) fits. */
export type Rankable = {
  likes_count: number
  respects_count: number
  comments_count: number
  views_count: number
  created_at: string
  team_id: string
}

/** Higher = hotter. engagement × time-decay × team-affinity × matchday boost. `liveTeams` = club ids playing now. */
export function hotScore(c: Rankable, myTeam: string | null, liveTeams: ReadonlySet<string> | null = null, now: number = Date.now()): number {
  const engagement = c.likes_count * RANK.like + c.respects_count * RANK.respect + c.comments_count * RANK.comment + c.views_count * RANK.view + 1
  const t = new Date(c.created_at).getTime()
  // A bad/unparseable timestamp must not poison the sort with NaN — treat it as very old (score ≈ 0).
  const ageHours = Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 1e9
  const recency = Math.pow(0.5, ageHours / RANK.halfLifeHours)
  const affinity = myTeam && c.team_id === myTeam ? RANK.teamBoost : 1
  const matchday = liveTeams && liveTeams.has(c.team_id) && ageHours < RANK.matchdayFreshHours ? RANK.matchdayBoost : 1
  return engagement * recency * affinity * matchday
}
