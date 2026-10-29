'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { applyLike, type LikeState } from '../schema'
import { likeReviewAction } from '../server/actions'

type Likeable = LikeState & { user_id: string }
const keyOf = (playerId: string, authorId: string) => `${playerId}:${authorId}`

/**
 * My ♥ on reviews, optimistic: the heart and the count change at once, and go back if the server says no. The state
 * lives here (not in each button) so a review that rotates away and back on the home keeps what I did.
 */
export function useReviewLikes() {
  const t = useTranslations('ratings')
  const FAILED = t('likeFailed')
  const [changed, setChanged] = useState<Record<string, LikeState>>({})
  const [error, setError] = useState<string | null>(null)
  // One request per review at a time: a fast double tap waits for the first answer.
  const busy = useRef(new Set<string>())

  const view = useCallback(
    (playerId: string, r: Likeable): LikeState => changed[keyOf(playerId, r.user_id)] ?? { liked: r.liked, likes_count: r.likes_count },
    [changed],
  )

  const toggle = useCallback(
    async (playerId: string, r: Likeable) => {
      const key = keyOf(playerId, r.user_id)
      if (busy.current.has(key)) return
      const before = view(playerId, r)
      const after = applyLike(before, !before.liked)
      busy.current.add(key)
      setError(null)
      setChanged((c) => ({ ...c, [key]: after }))
      let failure: string | null = null
      try {
        const res = await likeReviewAction({ playerId, authorId: r.user_id, on: after.liked })
        if (!res?.data || !('ok' in res.data)) failure = (res?.data && 'error' in res.data && res.data.error) || FAILED
      } catch {
        // Offline or the server action threw: same as a refusal.
        failure = FAILED
      } finally {
        busy.current.delete(key)
      }
      if (failure) {
        setChanged((c) => ({ ...c, [key]: before }))
        setError(failure)
      }
    },
    [view, FAILED],
  )

  return { view, toggle, error }
}

/** ♥ and the count on a review. My own review shows the count only (no liking yourself). */
export function ReviewLike({ nick, mine, state, onToggle, className }: { nick: string; mine: boolean; state: LikeState; onToggle: () => void; className?: string }) {
  const t = useTranslations('ratings')
  const count = state.likes_count.toLocaleString('he-IL')
  if (mine)
    return (
      <span className={cn('rv-like', className)}>
        <Heart className="size-3.5 text-live" aria-hidden="true" />
        <span className="t-num">{count}</span>
        <span className="sr-only">{t('myLikesSuffix')}</span>
      </span>
    )
  return (
    <button
      type="button"
      className={cn('rv-like', className)}
      aria-pressed={state.liked}
      aria-label={t('likeAria', { nick, count })}
      onClick={onToggle}
    >
      <Heart className={cn('size-3.5 text-live', state.liked && 'fill-live')} aria-hidden="true" />
      <span className="t-num">{count}</span>
    </button>
  )
}
