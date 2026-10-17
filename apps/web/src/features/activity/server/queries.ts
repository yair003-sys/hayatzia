import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import {
  ACTIVITY_PAGE,
  activityHref,
  activityLine,
  encodeCursor,
  isActivityKind,
  relativeTime,
  type ActivityKind,
  type Cursor,
} from '../activity'

/** One row of the list, ready to show (serialisable: the "load more" action returns these too). */
export type ActivityItem = {
  id: number
  kind: ActivityKind
  updatedAt: string
  actorId: string | null
  nick: string | null
  line: string
  when: string
  href: string
  /** The post's picture (signed URL); null for a video, a trip, or a post that is gone. */
  thumb: string | null
  /** A video clip: shown as an icon (no frame is fetched for a list). */
  video: boolean
  /** Trip rows: "נסיעה מחיפה". */
  sub: string | null
}

export type ActivityPage = {
  items: ActivityItem[]
  next: string | null
  /** First page only: the fan's previous visit (rows changed after it are highlighted). */
  seenAt: string | null
  /** The newest updated_at among the rows shown: the visit is recorded up to it, not up to "now". */
  newestAt: string | null
}

const COLUMNS =
  'id,kind,actor_id,actor_count,updated_at,trip_id,clips(media_path,kind,audience),team_photos(media_path),trips(nick,from_city)'
const URL_TTL = 60 * 60
const clock = () => Date.now()
const ACTIVITY_KEEP_MS = 60 * 24 * 60 * 60 * 1000

/**
 * The badge: the fan's rows changed since the last visit, capped at 100 ("99+"). null when the read failed: the bell
 * then says it could not load and tries again, instead of showing no count (load test 2026-10-17, finding 6).
 * Deduplicated per request: the home renders its own bell and the layout's floating bell asks too (perf round 2).
 */
export const getUnreadCount = cache(async (): Promise<number | null> => {
  const supabase = await createClient()
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('activity_unread_count')
  return !error && typeof data === 'number' ? data : null
})

/**
 * One page of the fan's list, newest first, keyset on (updated_at, id) over activity_feed_idx. A fixed number of
 * requests whatever the page holds (Review Focus 4): the rows with their post / trip joined in (one query, with the
 * fan's last visit read alongside), then the actors' nicks (one `in` on the profiles key) and the thumbnails (one
 * signing call per bucket), in parallel. Never a lookup per row. Highlighting is left to the client, which keeps the
 * first render's `seenAt` for the whole visit. null when a read failed.
 */
export async function getActivityPage(me: string, before?: Cursor | null): Promise<ActivityPage | null> {
  const empty: ActivityPage = { items: [], next: null, seenAt: null, newestAt: null }
  const supabase = await createClient()
  if (!supabase) return empty

  let q = supabase
    .from('activity')
    .select(COLUMNS)
    .eq('user_id', me)
    // Same 60-day window as the badge (rows are pruned on write only).
    .gt('updated_at', new Date(clock() - ACTIVITY_KEEP_MS).toISOString())
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ACTIVITY_PAGE + 1)
  if (before) {
    const b = before
    q = q.or(`updated_at.lt."${b.updatedAt}",and(updated_at.eq."${b.updatedAt}",id.lt.${b.id})`)
  }
  const [{ data, error }, seen, blocked] = await Promise.all([
    q,
    before ? Promise.resolve({ data: null, error: null }) : supabase.from('activity_seen').select('seen_at').eq('user_id', me).maybeSingle(),
    getBlockedIdsOrNull(),
  ])
  // A failed read is "could not load", never "no activity" (load test 2026-10-17, finding 6).
  if (error || !data || seen.error || !blocked) return null
  if (!data.length) return { ...empty, seenAt: seen.data?.seen_at ?? null }

  const more = data.length > ACTIVITY_PAGE
  const page = more ? data.slice(0, ACTIVITY_PAGE) : data
  const last = page[page.length - 1]!
  // A fan blocked after their request was made: the request no longer surfaces. A blocked liker is not named.
  const rows = page.filter((r) => isActivityKind(r.kind) && !(r.kind === 'trip_request' && r.actor_id && blocked.includes(r.actor_id)))

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id && !blocked.includes(id)))]
  const clipPaths = rows.flatMap((r) => (r.clips && r.clips.kind !== 'video' ? [r.clips.media_path] : []))
  const photoPaths = rows.flatMap((r) => (r.team_photos ? [r.team_photos.media_path] : []))
  const [nicks, clipUrls, photoUrls] = await Promise.all([
    nicksOf(actorIds, supabase),
    signed(supabase, 'clips', clipPaths),
    signed(supabase, 'stand', photoPaths),
  ])

  const now = clock()
  const seenAt = seen.data?.seen_at ?? null
  const items = rows.map((r): ActivityItem => {
    const kind = r.kind as ActivityKind
    const nick = (r.actor_id && nicks.get(r.actor_id)) || (kind === 'trip_accepted' ? (r.trips?.nick ?? null) : null)
    return {
      id: r.id,
      kind,
      updatedAt: r.updated_at,
      actorId: r.actor_id,
      nick,
      line: activityLine({ kind, nick, count: r.actor_count }),
      when: relativeTime(r.updated_at, now),
      href: activityHref({ kind, tripId: r.trip_id, clipAudience: r.clips?.audience ?? null }),
      thumb: r.clips ? (clipUrls.get(r.clips.media_path) ?? null) : r.team_photos ? (photoUrls.get(r.team_photos.media_path) ?? null) : null,
      video: r.clips?.kind === 'video',
      sub: r.trips ? `נסיעה מ${r.trips.from_city}` : null,
    }
  })
  return {
    items,
    next: more ? encodeCursor({ updatedAt: last.updated_at, id: last.id }) : null,
    seenAt,
    newestAt: rows[0]?.updated_at ?? null,
  }
}

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>

/**
 * Nicks of the fans in the fan's own rows. A like on a league clip may come from another club, whose profile the fan's
 * session may not read (profiles RLS: own club), so this one read uses the server key, limited to the actor ids the
 * fan's own rows (RLS) returned, and only the nick. Without the key (local runs), the fan's session: other clubs then
 * show as "אוהד".
 */
async function nicksOf(ids: string[], supabase: Db): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const db = createAdminClient() ?? supabase
  const { data } = await db.from('profiles').select('user_id,nick').in('user_id', ids)
  return new Map((data ?? []).map((p) => [p.user_id, p.nick]))
}

async function signed(supabase: Db, bucket: 'clips' | 'stand', paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map()
  const { data } = await supabase.storage.from(bucket).createSignedUrls([...new Set(paths)], URL_TTL)
  return new Map((data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])))
}
