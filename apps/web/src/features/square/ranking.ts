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
  /** How hard behavioural content-type affinity tilts the mix (phase 3). A gentle tuner, never a takeover. */
  kindAffinityStrength: 0.25,
  /** The multiplier from kind affinity is clamped to this range (≈ ±25%). */
  kindAffinityMin: 0.78,
  kindAffinityMax: 1.28,
} as const

/** The fields the score needs — a loose shape so any clip row (raw or decorated) fits. */
export type Rankable = {
  likes_count: number
  respects_count: number
  comments_count: number
  views_count: number
  created_at: string
  team_id: string
  /** 'image' | 'video' — used by the behavioural content-type tilt (phase 3). Absent → neutral. */
  kind?: string
}

/** A fan's content-type engagement, as learned from their own behaviour (phase 3). Absent/both-zero → neutral. */
export type KindAffinity = { image: number; video: number }

export type RankContext = {
  /** The viewer's club id (for affinity + mood). */
  myTeam?: string | null
  /** Club ids playing a live fixture right now (matchday boost). */
  liveTeams?: ReadonlySet<string> | null
  /** The viewer's club's recent result, which tilts the feed's mood. */
  mood?: 'win' | 'loss' | null
  /** The viewer's learned content-type affinity (phase 3). */
  kindAffinity?: KindAffinity | null
  now?: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/**
 * The behavioural content-type tilt: how much to multiply a clip of this kind, given the viewer's learned affinity.
 * Neutral (1) when there is no affinity yet. A fan who engages mostly with video sees video lifted and image damped,
 * within ±~25% — a gentle tuner on top of engagement and recency, never a takeover.
 */
export function kindMultiplier(kind: string | undefined, aff: KindAffinity | null | undefined): number {
  if (!aff || !kind) return 1
  const total = aff.image + aff.video
  if (!(total > 0)) return 1
  const share = (kind === 'video' ? aff.video : kind === 'image' ? aff.image : total / 2) / total
  return clamp(1 + RANK.kindAffinityStrength * (share - 0.5) * 2, RANK.kindAffinityMin, RANK.kindAffinityMax)
}

/** Higher = hotter. engagement × time-decay × team-affinity × matchday × post-match mood × content-type tilt. */
export function hotScore(c: Rankable, ctx: RankContext = {}): number {
  const { myTeam = null, liveTeams = null, mood = null, kindAffinity = null, now = Date.now() } = ctx
  const engagement = c.likes_count * RANK.like + c.respects_count * RANK.respect + c.comments_count * RANK.comment + c.views_count * RANK.view + 1
  const t = new Date(c.created_at).getTime()
  // A bad/unparseable timestamp must not poison the sort with NaN — treat it as very old (score ≈ 0).
  const ageHours = Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 1e9
  const recency = Math.pow(0.5, ageHours / RANK.halfLifeHours)
  const own = !!myTeam && c.team_id === myTeam
  const affinity = own ? RANK.teamBoost : 1
  const matchday = liveTeams && liveTeams.has(c.team_id) && ageHours < RANK.matchdayFreshHours ? RANK.matchdayBoost : 1
  const moodMul = mood === 'loss' && !own ? RANK.lossOthersDamp : mood === 'win' && own ? RANK.winOwnBoost : 1
  return engagement * recency * affinity * matchday * moodMul * kindMultiplier(c.kind, kindAffinity)
}
