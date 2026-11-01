'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { PostReactions } from './post-reactions'
import { deletePostAction, editPostAction, markPostViewedAction } from '../server/actions'
import { POST_BODY_MAX, POST_TITLE_MAX, type NewsPost } from '../schema'

/** One channel post: media, title, body, reactions, a comments button and the view count. Channel admins get inline
 *  edit + delete. Fires a unique view once the card is actually on screen. */
export function PostCard({
  post,
  isAdmin,
  onReact,
  onOpenComments,
  onReplace,
  onRemove,
}: {
  post: NewsPost
  isAdmin: boolean
  onReact: (postId: string, emoji: string | null) => void
  onOpenComments: (postId: string) => void
  onReplace: (post: NewsPost) => void
  onRemove: (postId: string) => void
}) {
  const t = useTranslations('teamNews')
  const ref = useRef<HTMLElement>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(post.title ?? '')
  const [body, setBody] = useState(post.body)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

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

  const save = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    const r = await editPostAction({ postId: post.id, title: title.trim() || undefined, body: body.trim() })
    setBusy(false)
    if (r.data && 'post' in r.data && r.data.post) {
      onReplace(r.data.post)
      setEditing(false)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    const r = await deletePostAction({ postId: post.id })
    setBusy(false)
    if (r.data?.ok) onRemove(post.id)
  }

  return (
    <article ref={ref} className="rounded-2xl border border-line bg-surface-2 p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-medium text-fg">{post.authorNick}</span>
          <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
          {post.editedAt && <span className="text-dim">· {t('edited')}</span>}
        </div>
        {isAdmin && !editing && (
          <div className="flex items-center gap-1">
            <button type="button" aria-label={t('edited')} className="rounded-md p-1 text-muted hover:text-fg" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label={t('deletePost')} className="rounded-md p-1 text-muted hover:text-fg" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      {editing ? (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={POST_TITLE_MAX}
            placeholder={t('titlePlaceholder')}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={POST_BODY_MAX}
            rows={4}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !body.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-text disabled:opacity-50" onClick={() => void save()}>
              {t('publish')}
            </button>
            <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-muted" onClick={() => { setEditing(false); setTitle(post.title ?? ''); setBody(post.body) }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {post.title && <h3 className="mb-1 text-base font-semibold text-fg">{post.title}</h3>}
          <p className="whitespace-pre-wrap break-words text-sm text-fg">{post.body}</p>
          {post.mediaUrl &&
            (post.mediaKind === 'video' ? (
              <video src={post.mediaUrl} controls playsInline className="mt-3 max-h-96 w-full rounded-xl" />
            ) : (
              <img src={post.mediaUrl} alt="" loading="lazy" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
            ))}
        </>
      )}

      {confirming && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface p-2 text-sm">
          <span className="text-muted">{t('confirmDelete')}</span>
          <button type="button" disabled={busy} className="rounded-md bg-red-600 px-2 py-1 text-white" onClick={() => void remove()}>
            {t('deletePost')}
          </button>
          <button type="button" className="rounded-md px-2 py-1 text-muted" onClick={() => setConfirming(false)}>
            ✕
          </button>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-3">
        <PostReactions reactions={post.reactions} myReaction={post.myReaction} onReact={(e) => onReact(post.id, e)} />
        <button type="button" className="flex items-center gap-1 text-sm text-muted hover:text-fg" onClick={() => onOpenComments(post.id)}>
          <MessageSquare className="size-4" aria-hidden="true" />
          {t('comments', { n: post.comments })}
        </button>
        <span className="text-xs text-dim">{t('views', { n: post.views })}</span>
      </footer>
    </article>
  )
}
