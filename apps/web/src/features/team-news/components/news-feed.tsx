'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { openChannel } from '@/lib/supabase/channel'
import { PostCard } from './post-card'
import { PostComments } from './post-comments'
import { PostComposer } from './post-composer'
import { loadOlderNewsAction, loadPostAction, markNewsSeenAction, reactPostAction } from '../server/actions'
import { PAGE_SIZE, postIdFromBroadcast, reactionFromBroadcast, type NewsPost } from '../schema'

/** The news tab: the admin composer (admins only), then the club's channel feed, live. New posts (realtime INSERT →
 *  fetch by id), live reaction totals, a comment thread overlay, keyset "load older", and marking the tab seen on
 *  mount. */
export function NewsFeed({ teamId, meId, isAdmin, initial }: { teamId: string; meId: string; isAdmin: boolean; initial: NewsPost[] }) {
  const t = useTranslations('teamNews')
  const [posts, setPosts] = useState<NewsPost[]>(initial)
  const [openPost, setOpenPost] = useState<string | null>(null)
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

  const onReplace = useCallback((post: NewsPost) => setPosts((cur) => cur.map((p) => (p.id === post.id ? post : p))), [])
  const onRemove = useCallback((postId: string) => setPosts((cur) => cur.filter((p) => p.id !== postId)), [])

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

  const onPublished = useCallback((post: NewsPost) => setPosts((cur) => (cur.some((p) => p.id === post.id) ? cur : [post, ...cur])), [])

  return (
    <div className="space-y-3">
      {isAdmin && <PostComposer meId={meId} onPublished={onPublished} />}
      {posts.length === 0 ? (
        <p className="py-12 text-center text-muted">{t('empty')}</p>
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} isAdmin={isAdmin} onReact={onReact} onOpenComments={setOpenPost} onReplace={onReplace} onRemove={onRemove} />
        ))
      )}
      {hasMore && posts.length > 0 && (
        <button type="button" disabled={loading} className="mx-auto block rounded-lg px-4 py-2 text-sm text-muted" onClick={() => void loadOlder()}>
          {loading ? '…' : t('loadOlder')}
        </button>
      )}
      {openPost && <PostComments postId={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  )
}
