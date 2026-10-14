import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { ChatMessage } from '@/features/chat/schema'
import { average, type Review } from '@/features/ratings/schema'
import { getBlockedIds } from '@/features/safety/server/queries'
import type { Clip } from '@/features/square/schema'
import { CLIP_COLUMNS, decorate } from '@/features/square/server/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { groupStories, REVIEWS_PER_PLAYER, type StoryGroup } from '../schema'

// Home sections: one round of queries each (never one per row). Personal or club-private reads use the fan's session
// (RLS) and are never cached; the two club-wide numbers are cached per club with the service role.

export type StoryItem = Clip & { seen: boolean }

/** Newest club posts scanned for the stories row, and the most circles shown. */
const STORY_SCAN = 60
const STORY_CIRCLES = 15
const STORY_COLUMNS = `${CLIP_COLUMNS},clip_views(user_id)` as const

/**
 * Stories: the club's fans' latest Square posts (24 h, RLS), one circle per fan, unseen first. View-once posts stay
 * out (watching one makes it disappear). `seen` = a clip_views row of mine (RLS returns only my own rows). Over the
 * team feed index; then likes, respects and signed URLs for the shown clips in one batch (decorate).
 */
export async function getStories(teamId: string, me: string): Promise<StoryGroup<StoryItem>[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from('clips')
      .select(STORY_COLUMNS)
      .eq('team_id', teamId)
      .eq('once', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(STORY_SCAN),
    getBlockedIds(),
  ])
  if (error || !data?.length) return []
  const rows = data.map(({ clip_views: views, ...r }) => ({ ...r, seen: views.length > 0 }))
  const groups = groupStories(rows, { me, blocked, max: STORY_CIRCLES })
  if (groups.length === 0) return []
  const clips = new Map((await decorate(supabase, groups.flatMap((g) => g.clips), me)).map((c) => [c.id, c]))
  return groups.map((g) => ({
    ...g,
    clips: g.clips.flatMap((r) => {
      const c = clips.get(r.id)
      return c ? [{ ...c, seen: r.seen }] : []
    }),
  }))
}

/**
 * "🔥 החם בכיכר היום": the most-liked live posts the fan may see in the Square (league posts, and team posts of their
 * own club only: RLS), never view-once, never a blocked fan. Over clips_hot_idx; decorated in one batch.
 */
export async function getHotClips(me: string, limit = 4): Promise<Clip[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from('clips')
      .select(CLIP_COLUMNS)
      .eq('once', false)
      .gt('likes_count', 0)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit * 2),
    getBlockedIds(),
  ])
  const rows = (data ?? []).filter((r) => !blocked.includes(r.user_id)).slice(0, limit)
  if (error || rows.length === 0) return []
  return decorate(supabase, rows, me)
}

export type HomePlayer = {
  id: string
  number: number | null
  name_short: string
  position: string
  avg: number | null
  count: number
  /** Most-liked first (the rotation order). */
  reviews: Review[]
}

/**
 * Player cards on the home: the club's squad, most-rated first then by shirt number (always shown, rated or not), with
 * their most-liked reviews. Two queries in parallel.
 */
export async function getHomePlayers(teamId: string, me: string, max = 8): Promise<HomePlayer[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const [players, reviews] = await Promise.all([
    supabase.from('players').select('id,number,name_short,position,player_rating_stats(sum,count)').eq('team_id', teamId),
    supabase.rpc('home_player_reviews', { p_per_player: REVIEWS_PER_PLAYER }),
  ])
  const byPlayer = new Map<string, Review[]>()
  for (const r of reviews.data ?? []) {
    const list = byPlayer.get(r.player_id) ?? []
    list.push({
      user_id: r.author_id,
      nick: r.nick,
      stars: r.stars,
      review: r.review,
      updated_at: r.updated_at,
      likes_count: r.likes_count,
      liked: r.liked,
      mine: r.author_id === me,
    })
    byPlayer.set(r.player_id, list)
  }
  return (players.data ?? [])
    .map((p) => {
      const s = p.player_rating_stats
      return {
        id: p.id,
        number: p.number,
        name_short: p.name_short,
        position: p.position,
        avg: s ? average(s.sum, s.count) : null,
        count: s?.count ?? 0,
        reviews: byPlayer.get(p.id) ?? [],
      }
    })
    .sort((a, b) => b.count - a.count || (a.number ?? 999) - (b.number ?? 999))
    .slice(0, max)
}

/** The last messages of the club's chat, oldest first, without blocked fans. Over team_messages_team_created_idx. */
export async function getChatPreview(teamId: string, n = 3): Promise<{ messages: ChatMessage[]; hidden: string[] }> {
  const supabase = await createClient()
  if (!supabase) return { messages: [], hidden: [] }
  const [{ data }, blocked] = await Promise.all([
    supabase
      .from('team_messages')
      .select('id,user_id,nick,body,created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(n * 2),
    getBlockedIds(),
  ])
  const messages = (data ?? []).filter((m) => !blocked.includes(m.user_id)).slice(0, n).reverse()
  return { messages, hidden: blocked }
}

/**
 * "אוהדים פעילים": distinct club fans active in the last 7 days. A club-wide number, cached per club for a minute and
 * read with the service role. `teamId` must be the signed-in fan's own club (checked by the caller's session).
 */
export async function getActiveFans(teamId: string): Promise<number | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(`home-active:${teamId}`)
  const db = createAdminClient()
  if (!db) return null
  const { data, error } = await db.rpc('home_active_fans', { p_team: teamId })
  // The code only (never data): a service-role failure must show in the server logs instead of a silent dash.
  if (error) console.error('home_active_fans failed', error.code)
  return error || typeof data !== 'number' ? null : data
}

/** "🏆 אוהדי השבוע": top 3 (nick, points) of the club, cached per club for 5 minutes (service role, own club only). */
export async function getFansOfWeek(teamId: string): Promise<{ nick: string; points: number }[]> {
  'use cache'
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 })
  cacheTag(`home-fans-week:${teamId}`)
  const db = createAdminClient()
  if (!db) return []
  const { data, error } = await db.rpc('home_fans_of_week', { p_team: teamId })
  if (error) console.error('home_fans_of_week failed', error.code)
  return error ? [] : (data ?? [])
}
