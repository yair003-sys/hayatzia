'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { roleOf, SLOT_HE } from '@/features/lineup/schema'
import { ReviewLike, useReviewLikes } from '@/features/ratings/components/review-like'
import { FADE_MS, reviewIndex, ROTATE_MS, shouldRotate } from '../schema'
import type { HomePlayer } from '../server/queries'

const positionHe = (position: string) => {
  const role = roleOf(position)
  return role ? SLOT_HE[role] : 'מאמן'
}

/**
 * "השחקנים בעיני האוהדים": a card per rated player whose review line fades every 4 s to the next most-liked review
 * (cards a step apart). The rotation stops while the cards are off screen, under reduced motion, in a hidden tab, and
 * while a pointer is over the cards or focus is inside them (to read or to ♥).
 */
export function PlayerReviews({ players }: { players: HomePlayer[] }) {
  const root = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [fading, setFading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const likes = useReviewLikes()
  const rotate = shouldRotate({ visible, reducedMotion, pageHidden, held: hover || focus })

  useEffect(() => {
    const el = root.current
    if (!el) {
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible(Boolean(e?.isIntersecting))
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => {
      setReducedMotion(mq.matches)
    }
    const onVisibility = () => {
      setPageHidden(document.visibilityState === 'hidden')
    }
    const first = setTimeout(() => {
      onMotion()
      onVisibility()
    }, 0)
    mq.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(first)
      io.disconnect()
      mq.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!rotate) {
      return
    }
    let swap: ReturnType<typeof setTimeout> | undefined
    const every = setInterval(() => {
      setFading(true)
      swap = setTimeout(() => {
        setTick((t) => t + 1)
        setFading(false)
      }, FADE_MS)
    }, ROTATE_MS)
    return () => {
      clearInterval(every)
      clearTimeout(swap)
      // Stopped half-way through a fade: the line comes back now and stays visible when the rotation resumes.
      setFading(false)
    }
  }, [rotate])

  const hiddenLine = fading && rotate

  return (
    <>
      <div
        ref={root}
        className="hm-pcards"
        role="list"
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setHover(true)
        }}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false)
        }}
      >
        {players.map((p, k) => {
          const i = reviewIndex(tick, k, p.reviews.length)
          const r = i >= 0 ? p.reviews[i] : undefined
          const filled = Math.round(p.avg ?? 0)
          return (
            <article key={p.id} role="listitem" className="hm-pcard" aria-label={p.name_short}>
              <div className="hm-pcard-head">
                <span className="hm-num t-num" aria-hidden="true">
                  {p.number ?? '–'}
                </span>
                <span className="flex min-w-0 flex-col">
                  <Link href="/stand/players" className="hm-pname">
                    {p.name_short}
                  </Link>
                  <span className="hm-pos">{positionHe(p.position)}</span>
                </span>
              </div>
              <div className="hm-rating">
                <span className="hm-stars" aria-hidden="true">
                  {'★'.repeat(filled)}
                  {'☆'.repeat(5 - filled)}
                </span>
                <b className="t-num">{p.avg === null ? '–' : p.avg.toFixed(1)}</b>
                <small className="t-num">({p.count.toLocaleString('he-IL')})</small>
                <span className="sr-only">
                  ממוצע {p.avg ?? '–'} מתוך 5, {p.count} מדרגים
                </span>
              </div>
              {r ? (
                <div className="hm-rv" style={{ opacity: hiddenLine ? 0 : 1 }} data-testid={`review-${p.id}`}>
                  <p>״{r.review}״</p>
                  <span className="hm-rv-by">
                    <span className="truncate">{r.nick}</span>
                    <ReviewLike nick={r.nick} mine={r.mine} state={likes.view(p.id, r)} onToggle={() => void likes.toggle(p.id, r)} />
                  </span>
                </div>
              ) : (
                <p className="hm-rv-none">עוד אין ביקורות. היה הראשון</p>
              )}
            </article>
          )
        })}
      </div>
      {likes.error && (
        <p role="alert" className="text-xs text-live">
          {likes.error}
        </p>
      )}
    </>
  )
}
