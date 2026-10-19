import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { CLIP_FILTERS, FEED_SIZE, type Audience, type Clip, type ClipComment, type ClipFilter } from '../schema'

export const CLIP_COLUMNS =
  'id,user_id,team_id,nick,media_path,kind,caption,captions,filter,speed,trim_start,trim_end,tags,once,likes_count,respects_count,comments_count,views_count,created_at,expires_at,audience'
const COLUMNS = CLIP_COLUMNS
const URL_TTL = 60 * 60 // seconds; feed pages are short-lived anyway

type Cursor = { createdAt: string; id: string }

/**
 * One page of a Square tab, newest first (keyset): 'all' = league posts, 'team' = the fan's club only.
 * RLS hides expired posts, other clubs' team posts and view-once posts already seen.
 * Private per fan (likes, view-once state): reads the session, never cached.
 * null when a read failed: the feed says "could not load" instead of "the Square is empty" (load test 2026-10-17,
 * finding 6).
 */
export async function getSquareFeed(opts: { audience?: Audience; before?: Cursor } = {}): Promise<Clip[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  if (!me) return []

  // The two feeds: the league tab ('all') and the club tab ('team'). A 'both' post shows in both; the club tab is
  // scoped to the viewer's own club so other clubs' 'both' posts don't leak in.
  const tab = opts.audience ?? 'all'
  let q = supabase.from('clips').select(COLUMNS)
  if (tab === 'team') {
    const { data: team } = await supabase.rpc('my_team')
    q = q.in('audience', ['team', 'both'])
    if (team) q = q.eq('team_id', team)
  } else {
    q = q.in('audience', ['all', 'both'])
  }
  q = q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(FEED_SIZE)
  if (opts.before) {
    const b = opts.before
    q = q.or(`created_at.lt."${b.createdAt}",and(created_at.eq."${b.createdAt}",id.lt.${b.id})`)
  }
  const [{ data: all, error }, blocked] = await Promise.all([q, getBlockedIdsOrNull()])
  if (error || !all || !blocked) return null
  const rows = all.filter((r) => !blocked.includes(r.user_id))
  if (!rows.length) return []

  return decorate(supabase, rows, me)
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
