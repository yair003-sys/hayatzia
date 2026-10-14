'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { likeReviewSchema, playerIdSchema, rateSchema } from '../schema'
import { getRecentReviews } from './queries'

/** Insert or change the fan's rating. The database checks the player is in the fan's club and keeps the stats. */
export const ratePlayerAction = actionClient.inputSchema(rateSchema).action(async ({ parsedInput }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'הדירוג לא זמין בסביבה הזאת' }
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'צריך להתחבר' }
  const { playerId, stars, review } = parsedInput
  const existing = await supabase
    .from('player_ratings')
    .select('stars')
    .eq('player_id', playerId)
    .eq('user_id', userId)
    .maybeSingle()
  const { error } = existing.data
    ? await supabase.from('player_ratings').update({ stars, review }).eq('player_id', playerId).eq('user_id', userId)
    : await supabase.from('player_ratings').insert({ player_id: playerId, stars, review })
  if (error) return { error: error.message.includes('not_your_player') ? 'מדרגים רק שחקנים של הקבוצה שלך' : 'השמירה נכשלה' }
  return { ok: true as const, previous: existing.data?.stars ?? null }
})

export const reviewsAction = actionClient
  .inputSchema(playerIdSchema)
  .action(async ({ parsedInput }) => ({ reviews: await getRecentReviews(parsedInput.playerId) }))

/**
 * ♥ on another fan's review, or take it back. The database keeps the count exact and refuses your own review, a
 * player of another club, a review without words and blocked fans (RLS).
 */
export const likeReviewAction = actionClient.inputSchema(likeReviewSchema).action(async ({ parsedInput: { playerId, authorId, on } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = on
    ? await supabase.from('player_rating_likes').insert({ player_id: playerId, author_id: authorId })
    : await supabase.from('player_rating_likes').delete().eq('player_id', playerId).eq('author_id', authorId)
  // 23505: already liked (a second tab): the wanted state holds.
  if (error && error.code !== '23505') return { error: 'הלייק לא נשמר. נסה שוב' }
  return { ok: true as const }
})
