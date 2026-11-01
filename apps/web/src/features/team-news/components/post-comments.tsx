'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { SendHorizontal, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { openChannel } from '@/lib/supabase/channel'
import { COMMENT_MAX, PAGE_SIZE, commentFromBroadcast, type NewsComment } from '../schema'
import { commentPostAction, loadCommentsAction, loadOlderCommentsAction } from '../server/actions'

/** A focused thread for one post: list + composer, live. Opens as a full-screen overlay from a post's comments button. */
export function PostComments({ postId, onClose }: { postId: string; onClose: () => void }) {
  const t = useTranslations('teamNews')
  const [comments, setComments] = useState<NewsComment[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    let on = true
    void (async () => {
      const r = await loadCommentsAction({ postId })
      const c = r.data?.comments ?? []
      if (on) {
        setComments(c)
        setHasMore(c.length >= PAGE_SIZE)
      }
    })()
    return () => {
      on = false
    }
  }, [postId])

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false
    void (async () => {
      const ch = await openChannel(supabase, `newspost:${postId}`, { private: true })
      ch.on('broadcast', { event: 'COMMENT' }, ({ payload }) => {
        const c = commentFromBroadcast(payload)
        if (!c) return
        setComments((cur) => (cur.some((x) => x.id === c.id) ? cur : [...cur, c]))
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
  }, [postId])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const r = await commentPostAction({ postId, body })
    setSending(false)
    if (r.data && 'comment' in r.data && r.data.comment) {
      const added = r.data.comment
      setText('')
      setComments((cur) => (cur.some((x) => x.id === added.id) ? cur : [...cur, added]))
    }
  }

  const loadOlder = async () => {
    const first = comments[0]
    if (!first) return
    const r = await loadOlderCommentsAction({ postId, cursor: { createdAt: first.createdAt, id: first.id } })
    const older = r.data?.comments
    if (older && older.length) setComments((cur) => [...older, ...cur])
    setHasMore((older?.length ?? 0) >= PAGE_SIZE)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <header className="flex items-center justify-between border-b border-line p-3">
        <h2 className="text-sm font-semibold text-fg">{t('comments', { n: comments.length })}</h2>
        <button type="button" aria-label={t('cancel')} onClick={onClose} className="rounded-md p-1 text-muted hover:text-fg">
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {hasMore && (
          <button type="button" className="mx-auto block text-xs text-muted" onClick={() => void loadOlder()}>
            {t('loadOlder')}
          </button>
        )}
        {comments.length === 0 ? (
          <p className="py-10 text-center text-muted">{t('noComments')}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-surface-2 p-2 text-sm">
              <span className="font-medium text-fg">{c.nick}</span>
              <p className="whitespace-pre-wrap break-words text-fg">{c.body}</p>
            </div>
          ))
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={COMMENT_MAX}
          placeholder={t('writeComment')}
          className="min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 py-2 text-sm"
        />
        <button type="submit" disabled={sending || !text.trim()} aria-label={t('publish')} className="rounded-full bg-accent p-2 text-accent-text disabled:opacity-50">
          <SendHorizontal className="size-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
