import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { getClubPlayers } from '@/features/teams/server/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { squadWithRatings, type RatingStat } from '../club'
import type { PlayerRow, Review } from '../schema'

/**
 * The fan's club squad with average rating and the fan's own rating. The squad and the averages are the same for every
 * fan of the club and come from the shared caches; only the fan's own ratings are read per request (RLS). A failed read
 * falls back to empty, as before (load test 2026-10-17, finding 6, "not changed").
 */
export async function getSquadWithRatings(teamId: string, userId: string): Promise<PlayerRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const [players, stats, mine] = await Promise.all([
    getClubPlayers(teamId),
    getClubRatingStats(teamId),
    supabase.from('player_ratings').select('player_id,stars,review').eq('user_id', userId),
  ])
  return squadWithRatings(players ?? [], stats ?? [], mine.data ?? [])
}

/**
 * The rating totals of the club's players (player_rating_stats), or null when the read failed. Under RLS every fan of
 * the club reads exactly these rows (player_rating_stats_read: the player is in the fan's club; there are no per-fan
 * rows), so they are read once per club with the service role and cached for 30 s (tag `rating-stats:<club>`,
 * refreshed at once by ratePlayerAction). `teamId` must be the signed-in fan's own club (from the caller's session
 * profile). Where this environment has no service key, the fan's own session reads them (RLS), as before.
 */
export async function getClubRatingStats(teamId: string): Promise<RatingStat[] | null> {
  try {
    const cached = await clubRatingStatsCached(teamId)
    if (cached) return cached
  } catch {
    return null
  }
  const supabase = await createClient()
  if (!supabase) return []
  const { data, error } = await supabase.from('player_rating_stats').select('player_id,sum,count')
  return error || !data ? null : data
}

async function clubRatingStatsCached(teamId: string): Promise<RatingStat[] | null> {
  'use cache'
  cacheLife({ stale: 30, revalidate: 30, expire: 120 })
  cacheTag(`rating-stats:${teamId}`)
  const db = createAdminClient()
  // No service key in this environment (fixed per deployment): the caller reads through the fan's session instead.
  if (!db) return null
  const { data, error } = await db
    .from('player_rating_stats')
    .select('player_id,sum,count,players!inner(team_id)')
    .eq('players.team_id', teamId)
  if (error) console.error('club rating stats read failed', error.code)
  // Thrown, not returned: a failure is never kept in the cache.
  if (error || !data) throw new Error('club rating stats read failed')
  return data.map((s) => ({ player_id: s.player_id, sum: s.sum, count: s.count }))
}

/** The newest reviews of a player with their ♥ count, my own ♥ and whether I wrote it. One round of two queries. */
export async function getRecentReviews(playerId: string): Promise<Review[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const [{ data: claims }, reviews, mine] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from('player_ratings')
      .select('user_id,nick,stars,review,updated_at,likes_count')
      .eq('player_id', playerId)
      .neq('review', '')
      .order('updated_at', { ascending: false })
      .limit(10),
    // RLS: only my own likes come back.
    supabase.from('player_rating_likes').select('author_id').eq('player_id', playerId),
  ])
  const me = claims?.claims.sub
  const liked = new Set((mine.data ?? []).map((l) => l.author_id))
  return (reviews.data ?? []).map((r) => ({ ...r, liked: liked.has(r.user_id), mine: r.user_id === me }))
}
