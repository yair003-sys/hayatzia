import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { average, positionGroup, type PlayerRow, type Review } from '../schema'

/** The fan's club squad with average rating and the fan's own rating. Team-private (RLS), never cached. */
export async function getSquadWithRatings(teamId: string, userId: string): Promise<PlayerRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const [players, stats, mine] = await Promise.all([
    supabase.from('players').select('id,number,name_he,name_short,position,injured,in_xi,pitch_x,pitch_y').eq('team_id', teamId),
    supabase.from('player_rating_stats').select('player_id,sum,count'),
    supabase.from('player_ratings').select('player_id,stars,review').eq('user_id', userId),
  ])
  const statBy = new Map((stats.data ?? []).map((s) => [s.player_id, s]))
  const mineBy = new Map((mine.data ?? []).map((m) => [m.player_id, m]))
  return (players.data ?? [])
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
    .sort(
      (a, b) =>
        positionGroup(a.position).order - positionGroup(b.position).order ||
        (a.number ?? 999) - (b.number ?? 999),
    )
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
