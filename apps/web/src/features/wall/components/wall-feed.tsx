'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, MessageCircle, Settings, BarChart3, PenLine } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { openChannel } from '@/lib/supabase/channel'
import { PostComments } from '@/features/team-news/components/post-comments'
import { PostComposer } from '@/features/team-news/components/post-composer'
import { PostReactions } from '@/features/team-news/components/post-reactions'
import {
  loadOlderNewsAction,
  loadPostAction,
  markNewsSeenAction,
  markPostViewedAction,
  reactPostAction,
} from '@/features/team-news/server/actions'
import { PAGE_SIZE, postIdFromBroadcast, reactionFromBroadcast, totalReactions, type NewsPost } from '@/features/team-news/schema'

type Tab = 'new' | 'hot'

/**
 * The wall: the club's channel feed in the X-style layout (redesign phase 3). It reuses the team-news backend
 * (posts, reactions, comments, views, realtime, keyset pagination) and only restyles it. Posting to the channel is
 * admins-only (RLS), so every post here is an official club post; fans react, comment, and speak in the chat. The
 * "fans post their own" layer is a later backend step.
 */
export function WallFeed({
  teamId,
  meId,
  isAdmin,
  clubName,
  clubShort,
  initial,
  unread,
}: {
  teamId: string
  meId: string
  isAdmin: boolean
  clubName: string
  clubShort: string
  initial: NewsPost[]
  unread: boolean
}) {
  const [posts, setPosts] = useState<NewsPost[]>(initial)
  const [tab, setTab] = useState<Tab>('new')
  const [openPost, setOpenPost] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void markNewsSeenAction({})
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false
    ;(async () => {
      const ch = await openChannel(supabase, `news:${teamId}`, { private: true })
      ch.on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
        const id = postIdFromBroadcast(payload)
        if (!id) return
        const r = await loadPostAction({ postId: id })
        const post = r.data?.post
        if (!post) return
        setPosts((cur) => (cur.some((p) => p.id === post.id) ? cur : [post, ...cur]))
      })
      ch.on('broadcast', { event: 'REACTION' }, ({ payload }) => {
        const r = reactionFromBroadcast(payload)
        if (!r) return
        setPosts((cur) => cur.map((p) => (p.id === r.id ? { ...p, reactions: r.reactions } : p)))
      })
      await supabase.realtime.setAuth()
      ch.subscribe()
      if (!cancelled) channel = ch
      else void supabase.removeChannel(ch)
    })()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [teamId])

  const onReact = useCallback((postId: string, emoji: string | null) => {
    setPosts((cur) =>
      cur.map((p) => {
        if (p.id !== postId) return p
        const reactions = { ...p.reactions }
        const prev = p.myReaction
        if (prev) {
          reactions[prev] = Math.max(0, (reactions[prev] ?? 1) - 1)
          if (reactions[prev] === 0) delete reactions[prev]
        }
        if (emoji) reactions[emoji] = (reactions[emoji] ?? 0) + 1
        return { ...p, myReaction: emoji, reactions }
      }),
    )
    void reactPostAction({ postId, emoji })
  }, [])

  const onPublished = useCallback((post: NewsPost) => {
    setPosts((cur) => (cur.some((p) => p.id === post.id) ? cur : [post, ...cur]))
    setComposing(false)
  }, [])

  const loadOlder = async () => {
    const last = posts[posts.length - 1]
    if (!last || loading) return
    setLoading(true)
    const r = await loadOlderNewsAction({ createdAt: last.createdAt, id: last.id })
    setLoading(false)
    const older = r.data?.posts
    if (older && older.length) setPosts((cur) => [...cur, ...older])
    setHasMore((older?.length ?? 0) >= PAGE_SIZE)
  }

  // "הכי חדש" keeps the server order; "הכי חם" sorts by engagement on the loaded set (no backend change).
  const shown = useMemo(() => {
    if (tab === 'new') return posts
    const heat = (p: NewsPost) => totalReactions(p.reactions) * 3 + p.comments * 2 + p.views
    return [...posts].sort((a, b) => heat(b) - heat(a))
  }, [posts, tab])

  return (
    <div className="wl">
      <div className="wl-in">
        <header className="wl-bar">
          <div className="wl-top">
            <div className="wl-title">
              <span className="wl-crest">{clubShort}</span>
              <span className="min-w-0">
                <b>הקיר · {clubName}</b>
                <span>הפיד של היציע</span>
              </span>
            </div>
            <div className="wl-acts">
              <Link href="/activity" className="wl-ico" aria-label="התראות">
                <Bell className="size-4" aria-hidden="true" />
                {unread && <span className="wl-badge" aria-label="חדש">•</span>}
              </Link>
              <Link href="/settings" className="wl-ico" aria-label="הגדרות">
                <Settings className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div role="tablist" aria-label="מיון הפיד" className="wl-ftabs">
            <button type="button" role="tab" aria-selected={tab === 'new'} className={`wl-ftab${tab === 'new' ? ' on' : ''}`} onClick={() => setTab('new')}>
              הכי חדש
            </button>
            <button type="button" role="tab" aria-selected={tab === 'hot'} className={`wl-ftab${tab === 'hot' ? ' on' : ''}`} onClick={() => setTab('hot')}>
              הכי חם
            </button>
          </div>
        </header>

        {/* compose: admins publish to the channel; fans speak in the club chat */}
        {isAdmin ? (
          composing ? (
            <div className="border-b-[7px] border-surface px-3.5 py-3">
              <PostComposer meId={meId} onPublished={onPublished} />
              <button type="button" className="mt-2 text-sm text-muted" onClick={() => setComposing(false)}>
                ביטול
              </button>
            </div>
          ) : (
            <button type="button" className="wl-compose w-full" onClick={() => setComposing(true)}>
              <span className="wl-me" aria-hidden="true" />
              <span className="wl-ph">מה חדש ביציע?</span>
              <span className="wl-post-btn">פרסם</span>
            </button>
          )
        ) : (
          <Link href="/stand/chat" className="wl-compose">
            <span className="wl-me" aria-hidden="true" />
            <span className="wl-ph">מה קורה ביציע? דברו בצ׳אט</span>
            <span className="wl-post-btn">לצ׳אט</span>
          </Link>
        )}

        {shown.length === 0 ? (
          <p className="wl-empty">עוד אין פוסטים בקיר. כאן יופיעו העדכונים של {clubShort}.</p>
        ) : (
          shown.map((p) => (
            <WallPost key={p.id} post={p} clubName={clubName} clubShort={clubShort} onReact={onReact} onOpenComments={setOpenPost} />
          ))
        )}

        {hasMore && shown.length > 0 && tab === 'new' && (
          <button type="button" disabled={loading} className="wl-empty w-full" onClick={() => void loadOlder()}>
            {loading ? '…' : 'טען עוד'}
          </button>
        )}
      </div>

      {isAdmin && (
        <button type="button" className="wl-fab" aria-label="פוסט חדש" onClick={() => setComposing(true)}>
          <PenLine className="size-5" aria-hidden="true" />
        </button>
      )}

      {openPost && <PostComments postId={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  )
}

/** One wall post in the X-style. Every channel post is an official club post today, so it wears the crest + tick. */
function WallPost({
  post,
  clubName,
  clubShort,
  onReact,
  onOpenComments,
}: {
  post: NewsPost
  clubName: string
  clubShort: string
  onReact: (postId: string, emoji: string | null) => void
  onOpenComments: (postId: string) => void
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e && e.intersectionRatio > 0.5) {
          void markPostViewedAction({ postId: post.id })
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [post.id])

  const time = new Date(post.createdAt).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <article ref={ref} className="wl-post official">
      <span className="wl-av" aria-hidden="true" />
      <div className="wl-body">
        <div className="wl-meta">
          <b>{clubName}</b>
          <span className="wl-tick" aria-label="רשמי">✔</span>
          <span className="wl-official-tag">רשמי</span>
          <span className="wl-at">·</span>
          <time dateTime={post.createdAt}>{time}</time>
        </div>
        {post.title && <p className="wl-title-txt">{post.title}</p>}
        <p className="wl-txt">{post.body}</p>
        {post.mediaUrl &&
          (post.mediaKind === 'video' ? (
            <video className="wl-media" src={post.mediaUrl} controls playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="wl-media" src={post.mediaUrl} alt="" loading="lazy" />
          ))}
        <div className="mt-2">
          <PostReactions reactions={post.reactions} myReaction={post.myReaction} onReact={(emoji) => onReact(post.id, emoji)} />
        </div>
        <div className="wl-acts2">
          <button type="button" className="inline-flex items-center gap-1.5" onClick={() => onOpenComments(post.id)}>
            <MessageCircle className="size-3.5" aria-hidden="true" />
            <span className="t-num">{post.comments}</span>
          </button>
          <span className="inline-flex items-center gap-1.5">
            <BarChart3 className="size-3.5" aria-hidden="true" />
            <span className="t-num">{post.views}</span>
          </span>
        </div>
      </div>
    </article>
  )
}
