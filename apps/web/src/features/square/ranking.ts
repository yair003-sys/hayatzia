// Algorithm v1 (phase 1+): a clip's "hot" score. Deterministic, from signals we already have — engagement, a fast
// time-decay (football content ages fast), a boost for the viewer's own club, a matchday jump for clubs playing now,
// and a post-match mood tilt (phase 4). No learned profile yet; that comes with behavioural personalisation (phase 3).

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
  /** After a loss, other clubs' content is damped (the fan doesn't want to see everyone else celebrating). */
  lossOthersDamp: 0.4,
  /** After a win, the fan's own club gets an extra lift (ride the celebration). */
  winOwnBoost: 1.3,
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

export type RankContext = {
  /** The viewer's club id (for affinity + mood). */
  myTeam?: string | null
  /** Club ids playing a live fixture right now (matchday boost). */
  liveTeams?: ReadonlySet<string> | null
  /** The viewer's club's recent result, which tilts the feed's mood. */
  mood?: 'win' | 'loss' | null
  now?: number
}

/** Higher = hotter. engagement × time-decay × team-affinity × matchday × post-match mood. */
export function hotScore(c: Rankable, ctx: RankContext = {}): number {
  const { myTeam = null, liveTeams = null, mood = null, now = Date.now() } = ctx
  const engagement = c.likes_count * RANK.like + c.respects_count * RANK.respect + c.comments_count * RANK.comment + c.views_count * RANK.view + 1
  const t = new Date(c.created_at).getTime()
  // A bad/unparseable timestamp must not poison the sort with NaN — treat it as very old (score ≈ 0).
  const ageHours = Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 1e9
  const recency = Math.pow(0.5, ageHours / RANK.halfLifeHours)
  const own = !!myTeam && c.team_id === myTeam
  const affinity = own ? RANK.teamBoost : 1
  const matchday = liveTeams && liveTeams.has(c.team_id) && ageHours < RANK.matchdayFreshHours ? RANK.matchdayBoost : 1
  const moodMul = mood === 'loss' && !own ? RANK.lossOthersDamp : mood === 'win' && own ? RANK.winOwnBoost : 1
  return engagement * recency * affinity * matchday * moodMul
}
