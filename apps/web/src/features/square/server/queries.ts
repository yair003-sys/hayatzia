import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { CLIP_FILTERS, FEED_SIZE, type Audience, type Clip, type ClipComment, type ClipFilter } from '../schema'
import { hotScore } from '../ranking'
import { LIVE_STATUSES } from '@/features/matches/schema'

export const CLIP_COLUMNS =
  'id,user_id,team_id,nick,media_path,kind,caption,captions,filter,speed,trim_start,trim_end,tags,once,likes_count,respects_count,comments_count,views_count,created_at,expires_at,audience'
const COLUMNS = CLIP_COLUMNS
const URL_TTL = 60 * 60 // seconds; feed pages are short-lived anyway

type DB = NonNullable<Awaited<ReturnType<typeof createClient>>>

/**
 * Club ids whose team is in a live fixture right now — used for the matchday boost. Almost always empty, which costs a
 * single indexed query; only during a live match does it do the small name→club mapping.
 */
export async function getLiveTeamIds(supabase: DB): Promise<Set<string>> {
  try {
    // Kicked off within the last 4h as well as a live status — guards against a stale fixture stuck "live".
    const since = new Date(Date.now() - 4 * 3_600_000).toISOString()
    const { data: live } = await supabase.from('fixtures').select('home_api_id,away_api_id').in('status', [...LIVE_STATUSES]).gte('kickoff_at', since)
    if (!live || live.length === 0) return new Set()
    const apiIds = [...new Set(live.flatMap((f) => [f.home_api_id, f.away_api_id]))]
    const [{ data: apiTeams }, { data: teams }] = await Promise.all([
      supabase.from('api_teams').select('name').in('api_id', apiIds),
      supabase.from('teams').select('id,api_names'),
    ])
    if (!apiTeams || !teams) return new Set()
    const liveNames = new Set(apiTeams.map((t) => t.name))
    return new Set(teams.filter((t) => t.api_names.some((n) => liveNames.has(n))).map((t) => t.id))
  } catch {
    // The matchday boost is a bonus; never let it break the feed.
    return new Set()
  }
}

/**
 * One page of a Square tab, newest first (keyset): 'all' = league posts, 'team' = the fan's club only.
 * RLS hides expired posts, other clubs' team posts and view-once posts already seen.
 * Private per fan (likes, view-once state): reads the session, never cached.
 * null when a read failed: the feed says "could not load" instead of "the Square is empty" (load test 2026-10-17,
 * finding 6).
 */
// Bounded 24h candidate window, ranked in JS (algorithm v1). A full SQL ranking is the scale-time optimisation.
const FEED_CANDIDATES = 160
const FEED_ENGAGED = 80

export async function getSquareFeed(opts: { audience?: Audience; offset?: number } = {}): Promise<Clip[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return []

  // The two feeds: the league tab ('all') and the club tab ('team'). A 'both' post shows in both; the club tab is
  // scoped to the viewer's own club. Ranked by the algorithm-v1 score (engagement × time-decay × own-club boost).
  const tab = opts.audience ?? 'all'
  const offset = Math.max(0, opts.offset ?? 0)
  const { data: myTeam } = await supabase.rpc('my_team')
  const build = () => {
    const base = supabase.from('clips').select(COLUMNS)
    if (tab === 'team') {
      const q = base.in('audience', ['team', 'both'])
      return myTeam ? q.eq('team_id', myTeam) : q
    }
    return base.in('audience', ['all', 'both'])
  }
  // Candidates: the most recent and the most engaged, so a fresh post and a viral older one both compete.
  const [recent, engaged, blocked, liveTeams] = await Promise.all([
    build().order('created_at', { ascending: false }).limit(FEED_CANDIDATES),
    build().order('likes_count', { ascending: false }).limit(FEED_ENGAGED),
    getBlockedIdsOrNull(),
    getLiveTeamIds(supabase),
  ])
  if (recent.error || engaged.error || !recent.data || !engaged.data || !blocked) return null
  const byId = new Map<string, (typeof recent.data)[number]>()
  for (const r of [...recent.data, ...engaged.data]) if (!blocked.includes(r.user_id)) byId.set(r.id, r)
  const ranked = [...byId.values()].sort((a, b) => hotScore(b, myTeam ?? null, liveTeams) - hotScore(a, myTeam ?? null, liveTeams))
  const page = ranked.slice(offset, offset + FEED_SIZE)
  if (!page.length) return []
  return decorate(supabase, page, me)
}

export type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>
export type ClipRow = { id: string; user_id: string; media_path: string; once: boolean; kind: string; audience: string; captions: unknown; filter: string } & Omit<
  Clip,
  'kind' | 'audience' | 'url' | 'liked' | 'respected' | 'uploading' | 'captions' | 'filter'
>

/**
 * Likes, respects and signed URLs for a set of posts: three requests for the whole set, never per post. null when one
 * of them failed (the hearts would all show "not liked" and the pictures be missing).
 */
export async function decorate(supabase: Db, rows: ClipRow[], me: string): Promise<Clip[] | null> {
  const ids = rows.map((r) => r.id)
  const signable = rows.filter((r) => !r.once || r.user_id === me).map((r) => r.media_path)
  const [likes, respects, signed] = await Promise.all([
    supabase.from('clip_likes').select('clip_id').in('clip_id', ids),
    supabase.from('clip_respects').select('clip_id').in('clip_id', ids),
    signable.length
      ? supabase.storage.from('clips').createSignedUrls(signable, URL_TTL)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[], error: null }),
  ])
  if (likes.error || respects.error || signed.error) return null
  const liked = new Set(likes.data?.map((l) => l.clip_id))
  const respected = new Set(respects.data?.map((r) => r.clip_id))
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))

  return rows.map(({ media_path, ...r }) => ({
    ...r,
    kind: r.kind === 'video' ? 'video' : 'image',
    audience: r.audience === 'team' ? 'team' : r.audience === 'both' ? 'both' : 'all',
    captions: Array.isArray(r.captions) ? (r.captions as Clip['captions']) : [],
    filter: (CLIP_FILTERS as readonly string[]).includes(r.filter) ? (r.filter as ClipFilter) : 'none',
    url: urls.get(media_path) ?? null,
    liked: liked.has(r.id),
    respected: respected.has(r.id),
  }))
}

/** One post as the poster sees it right after publishing (no page reload needed). */
export async function getClip(id: string): Promise<Clip | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return null
  const { data } = await supabase.from('clips').select(COLUMNS).eq('id', id).maybeSingle()
  if (!data) return null
  return (await decorate(supabase, [data], me))?.[0] ?? null
}

export async function getClipComments(clipId: string): Promise<ClipComment[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('clip_comments')
    .select('id,user_id,team_id,nick,body,created_at')
    .eq('clip_id', clipId)
    .order('created_at')
    .order('id')
    .limit(100)
  return data ?? []
}
