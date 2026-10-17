import type { RatingStat } from '@/features/stage4/schema'
import type { ClubPlayer } from '@/features/teams/server/queries'
import { average, positionGroup, type PlayerRow } from './schema'

// Pure merges of the club-wide parts (squad and rating stats, cached and shared by every fan of the club) with the
// fan's own part (their ratings), done per request (perf round 2). They never change their inputs: the cached arrays
// are shared between fans.

/** Trigger-kept totals of one player (player_rating_stats; the same shape as match_rating_stats). */
export type { RatingStat }
/** Every club's shared averages carry this tag; one club's also `rating-stats:<club>`. */
export const RATING_STATS_TAG = 'rating-stats'

/** The tag to refresh after a rating: the player's club (from the database), or every club when it is unknown. */
export function ratingStatsTag(teamId: string | null | undefined): string {
  return teamId ? `${RATING_STATS_TAG}:${teamId}` : RATING_STATS_TAG
}

/** The fan's own rating of a player. */
export type MyRating = { player_id: string; stars: number; review: string }

/** The squad page / home pitch rows: club average and count, the fan's own stars and review, by position then number. */
export function squadWithRatings(players: readonly ClubPlayer[], stats: readonly RatingStat[], mine: readonly MyRating[]): PlayerRow[] {
  const statBy = new Map(stats.map((s) => [s.player_id, s]))
  const mineBy = new Map(mine.map((m) => [m.player_id, m]))
  return players
    .map((p) => {
      const s = statBy.get(p.id)
      const m = mineBy.get(p.id)
      return {
        ...p,
        avg: s ? average(s.sum, s.count) : null,
        count: s?.count ?? 0,
        myStars: m?.stars ?? null,
        myReview: m?.review ?? '',
      }
    })
    .sort((a, b) => positionGroup(a.position).order - positionGroup(b.position).order || (a.number ?? 999) - (b.number ?? 999))
}
