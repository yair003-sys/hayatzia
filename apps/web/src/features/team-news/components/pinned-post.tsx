'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Megaphone, MessageSquare } from 'lucide-react'
import { PostComments } from './post-comments'
import type { NewsPost } from '../schema'

/** The latest channel post, pinned atop the chat tab, with a comments button that opens its thread (ED1: a pinned
 *  banner fetched separately, not a system row in the chat stream). */
export function PinnedPost({ post }: { post: NewsPost }) {
  const t = useTranslations('teamNews')
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface-2 p-3">
      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-accent-text">
        <Megaphone className="size-3.5" aria-hidden="true" />
        {t('tabNews')}
      </div>
      {post.title && <p className="text-sm font-semibold text-fg">{post.title}</p>}
      <p className="line-clamp-2 text-sm text-muted">{post.body}</p>
      <button type="button" className="mt-1 flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={() => setOpen(true)}>
        <MessageSquare className="size-3.5" aria-hidden="true" />
        {t('comments', { n: post.comments })}
      </button>
      {open && <PostComments postId={post.id} onClose={() => setOpen(false)} />}
    </div>
  )
}
