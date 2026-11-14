'use server'

import { actionClient } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'
import { signDefinerClips } from '@/features/square/server/queries'
import { searchSchema, type FanHit, type PostHit, type SearchResults } from '../schema'

async function db() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/**
 * One cross-club search over people, wall posts and Square clips. Each list is ranked by its own SECURITY DEFINER
 * function (relevance + popularity + recency), so results cross clubs without loosening any table's RLS. Clip media is
 * signed with the service role; fan avatars are public URLs.
 */
export const searchAction = actionClient.inputSchema(searchSchema).action(async ({ parsedInput: { q } }) => {
  const supabase = await db()
  const [fansRes, postsRes, clipsRes] = await Promise.all([
    supabase.rpc('search_fans', { q, p_limit: 20 }),
    supabase.rpc('search_posts', { q, p_limit: 20 }),
    supabase.rpc('search_clips', { q, p_limit: 20 }),
  ])
  const avatarUrl = (path: string | null) => (path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null)
  const fans: FanHit[] = (fansRes.data ?? []).map((f) => ({
    userId: f.user_id,
    nick: f.nick,
    teamId: f.team_id,
    avatarUrl: avatarUrl(f.avatar_path),
    followers: f.followers_count,
  }))
  const posts: PostHit[] = (postsRes.data ?? []).map((p) => ({
    id: p.id,
    teamId: p.team_id,
    authorId: p.author_id,
    authorNick: p.author_nick,
    title: p.title,
    body: p.body,
    official: p.official,
    createdAt: p.created_at,
  }))
  const clips = await signDefinerClips(clipsRes.data ?? [])
  const results: SearchResults = { fans, posts, clips }
  return { results }
})
