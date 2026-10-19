import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { ChatMessage } from '@/features/chat/schema'
import { average, type Review } from '@/features/ratings/schema'
import { getClubRatingStats } from '@/features/ratings/server/queries'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { getClubPlayers } from '@/features/teams/server/queries'
import type { Clip } from '@/features/square/schema'
import { CLIP_COLUMNS, decorate, getKindAffinity, getLiveTeamIds, getTeamMood } from '@/features/square/server/queries'
import { hotScore } from '@/features/square/ranking'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { groupStories, REVIEWS_PER_PLAYER, type StoryGroup } from '../schema'

// Home sections: one round of queries each (never one per row). Personal or club-private reads use the fan's session
// (RLS) and are never cached; the two club-wide numbers are cached per club with the service role, and the player
// cards use the shared per-club squad and averages (features/teams, features/ratings; perf round 2).
// A read that fails returns null, and the section says "could not load" with a retry instead of its empty state
// (load test 2026-10-17, finding 6). A cached read throws instead, so a failure is never kept in the cache.

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
export async function getStories(teamId: string, me: string): Promise<StoryGroup<StoryItem>[] | null> {
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
    getBlockedIdsOrNull(),
  ])
  if (error || !data || !blocked) return null
  if (!data.length) return []
  const rows = data.map(({ clip_views: views, ...r }) => ({ ...r, seen: views.length > 0 }))
  const groups = groupStories(rows, { me, blocked, max: STORY_CIRCLES })
  if (groups.length === 0) return []
  const decorated = await decorate(supabase, groups.flatMap((g) => g.clips), me)
  if (!decorated) return null
  const clips = new Map(decorated.map((c) => [c.id, c]))
  return groups.map((g) => ({
    ...g,
    clips: g.clips.flatMap((r) => {
      const c = clips.get(r.id)
      return c ? [{ ...c, seen: r.seen }] : []
    }),
  }))
}

/**
 * "🔥 החם בכיכר היום": the hottest live posts the fan may see in the Square (league posts, and team posts of their own
 * club only: RLS), never view-once, never a blocked fan. Ranked by the algorithm-v1 score (engagement × time-decay ×
 * own-club boost), so it is genuinely "hot", not just newest. Candidates come from two cheap indexed reads — the most
 * engaged and the most recent — merged, then scored in JS (a tiny set, no need for a ranking query here).
 */
export async function getHotClips(me: string, teamId: string | null = null, limit = 4): Promise<Clip[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  const [engaged, recent, blocked, liveTeams, mood, kindAffinity] = await Promise.all([
    supabase.from('clips').select(CLIP_COLUMNS).eq('once', false).order('likes_count', { ascending: false }).limit(40),
    supabase.from('clips').select(CLIP_COLUMNS).eq('once', false).order('created_at', { ascending: false }).limit(40),
    getBlockedIdsOrNull(),
    getLiveTeamIds(supabase),
    getTeamMood(supabase, teamId),
    getKindAffinity(supabase, me),
  ])
  if (engaged.error || recent.error || !engaged.data || !recent.data || !blocked) return null
  const byId = new Map<string, (typeof engaged.data)[number]>()
  for (const r of [...engaged.data, ...recent.data]) if (!blocked.includes(r.user_id)) byId.set(r.id, r)
  const ctx = { myTeam: teamId, liveTeams, mood, kindAffinity }
  const rows = [...byId.values()].sort((a, b) => hotScore(b, ctx) - hotScore(a, ctx)).slice(0, limit)
  if (rows.length === 0) return []
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
 * their most-liked reviews. The squad and the club's averages come from the shared per-club caches (the same for every
 * fan of the club); the reviews are per fan (my ♥, blocked fans, my own hidden review: RLS) and read per request.
 */
export async function getHomePlayers(teamId: string, me: string, max = 8): Promise<HomePlayer[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  const [players, stats, reviews] = await Promise.all([
    getClubPlayers(teamId),
    getClubRatingStats(teamId),
    supabase.rpc('home_player_reviews', { p_per_player: REVIEWS_PER_PLAYER }),
  ])
  if (!players || !stats || reviews.error || !reviews.data) return null
  const statBy = new Map(stats.map((s) => [s.player_id, s]))
  const byPlayer = new Map<string, Review[]>()
  for (const r of reviews.data) {
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
  return players
    .map((p) => {
      const s = statBy.get(p.id)
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
export async function getChatPreview(teamId: string, n = 3): Promise<{ messages: ChatMessage[]; hidden: string[] } | null> {
  const supabase = await createClient()
  if (!supabase) return { messages: [], hidden: [] }
  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from('team_messages')
      .select('id,user_id,nick,body,created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(n * 2),
    getBlockedIdsOrNull(),
  ])
  if (error || !data || !blocked) return null
  const messages = data.filter((m) => !blocked.includes(m.user_id)).slice(0, n).reverse()
  return { messages, hidden: blocked }
}

/**
 * "אוהדים פעילים": distinct club fans active in the last 7 days. A club-wide number, cached per club for a minute and
 * read with the service role. `teamId` must be the signed-in fan's own club (checked by the caller's session).
 */
export async function getActiveFans(teamId: string): Promise<number | null> {
  try {
    return await activeFansCached(teamId)
  } catch {
    return null
  }
}

async function activeFansCached(teamId: string): Promise<number | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(`home-active:${teamId}`)
  const db = createAdminClient()
  if (!db) return null
  const { data, error } = await db.rpc('home_active_fans', { p_team: teamId })
  // The code only (never data): a service-role failure must show in the server logs instead of a silent dash.
  if (error) console.error('home_active_fans failed', error.code)
  // Thrown, not returned: a failure is not kept in the cache for a minute.
  if (error || typeof data !== 'number') throw new Error('home_active_fans failed')
  return data
}

/**
 * "🏆 אוהדי השבוע": top 3 (nick, points) of the club, cached per club for 5 minutes (service role, own club only).
 * null when the read failed.
 */
export async function getFansOfWeek(teamId: string): Promise<{ nick: string; points: number }[] | null> {
  try {
    return await fansOfWeekCached(teamId)
  } catch {
    return null
  }
}

async function fansOfWeekCached(teamId: string): Promise<{ nick: string; points: number }[]> {
  'use cache'
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 })
  cacheTag(`home-fans-week:${teamId}`)
  const db = createAdminClient()
  if (!db) return []
  const { data, error } = await db.rpc('home_fans_of_week', { p_team: teamId })
  if (error) console.error('home_fans_of_week failed', error.code)
  // Thrown, not returned: a failure is not kept in the cache for 5 minutes.
  if (error || !data) throw new Error('home_fans_of_week failed')
  return data
}
