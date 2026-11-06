import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { PAGE_SIZE, type Cursor, type NewsComment, type NewsPost } from '../schema'

const POST_COLUMNS =
  'id,author_id,title,body,media_path,media_kind,views_count,reactions,comments_count,created_at,edited_at,official'

type PostRow = {
  id: string
  author_id: string
  title: string | null
  body: string
  media_path: string | null
  media_kind: string | null
  views_count: number
  reactions: unknown
  comments_count: number
  created_at: string
  edited_at: string | null
  official: boolean
}

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>

/** Turn post rows into NewsPost: attach the public media URL, the author nick, and my own reaction. */
async function decoratePosts(supabase: Client, rows: PostRow[]): Promise<NewsPost[]> {
  const ids = rows.map((r) => r.id)
  const authorIds = [...new Set(rows.map((r) => r.author_id))]
  const { data: claims } = await supabase.auth.getClaims()
  const me = claims?.claims.sub
  const [nicks, mine] = await Promise.all([
    authorIds.length ? supabase.from('profiles').select('user_id,nick').in('user_id', authorIds) : Promise.resolve({ data: [] }),
    ids.length && me
      ? supabase.from('channel_post_reactions').select('post_id,emoji').eq('user_id', me).in('post_id', ids)
      : Promise.resolve({ data: [] }),
  ])
  const nickOf = new Map((nicks.data ?? []).map((r) => [r.user_id, r.nick]))
  const myEmoji = new Map((mine.data ?? []).map((r) => [r.post_id, r.emoji]))
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    authorNick: nickOf.get(r.author_id) ?? '',
    title: r.title,
    body: r.body,
    mediaUrl: r.media_path ? supabase.storage.from('channel').getPublicUrl(r.media_path).data.publicUrl : null,
    mediaKind: r.media_kind === 'image' || r.media_kind === 'video' ? r.media_kind : null,
    views: r.views_count,
    reactions: (r.reactions ?? {}) as Record<string, number>,
    myReaction: myEmoji.get(r.id) ?? null,
    comments: r.comments_count,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    official: r.official ?? false,
  }))
}

/** Newest page of the club's channel (newest first), or older than `before` (keyset). null when the read failed. */
export async function getTeamNews(before?: Cursor): Promise<NewsPost[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('channel_posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) {
    q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  }
  const { data, error } = await q
  if (error || !data) return null
  return decoratePosts(supabase, data as PostRow[])
}

/** The single newest post of the club (for the pinned banner in the chat tab), or null when there is none / on failure. */
export async function getLatestPost(): Promise<NewsPost | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('channel_posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  return (await decoratePosts(supabase, data as PostRow[]))[0] ?? null
}

/** One post by id (used when a realtime INSERT tells the feed a post was published). */
export async function getPostById(id: string): Promise<NewsPost | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.from('channel_posts').select(POST_COLUMNS).eq('id', id).maybeSingle()
  if (error || !data) return null
  return (await decoratePosts(supabase, [data as PostRow]))[0] ?? null
}

/** A page of a post's comment thread (newest first), or older than `before`. null when the read failed. */
export async function getPostComments(postId: string, before?: Cursor): Promise<NewsComment[] | null> {
  const supabase = await createClient()
  if (!supabase) return []
  let q = supabase
    .from('channel_post_comments')
    .select('id,user_id,nick,body,created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) {
    q = q.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`)
  }
  const { data, error } = await q
  if (error || !data) return null
  return data.map((r) => ({ id: r.id, userId: r.user_id, nick: r.nick, body: r.body, createdAt: r.created_at })).reverse()
}

/** Is there a post newer than the last time I opened the news tab? */
export async function getChannelUnread(): Promise<boolean> {
  const supabase = await createClient()
  if (!supabase) return false
  const { data } = await supabase.rpc('channel_unread')
  return data === true
}

/** May I (the current fan) post to my club's channel? */
export async function amIChannelAdmin(): Promise<boolean> {
  const supabase = await createClient()
  if (!supabase) return false
  const { data } = await supabase.rpc('channel_can_post')
  return data === true
}
