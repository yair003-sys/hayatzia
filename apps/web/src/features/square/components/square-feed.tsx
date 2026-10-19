'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ImagePlus } from 'lucide-react'
import { LoadError } from '@/components/load-error'
import { FEED_SIZE, type Audience, type Clip } from '../schema'
import { loadMoreSquareAction } from '../server/actions'
import { ClipCard } from './clip-card'
import { UploadClip } from './upload-clip'

/** `initial` null = the first page could not be read: "could not load" with a retry, never "the Square is empty". */
type Props = { initial: Clip[] | null; meId: string; myTeamId: string; myNick: string; teamShort: string; audience: Audience; empty: string; tabs: ReactNode }

/** Reels: one post per screen, swipe up for the next; the next page loads as the last post comes into view. */
export function SquareFeed({ initial, meId, myTeamId, myNick, teamShort, audience, empty, tabs }: Props) {
  const [clips, setClips] = useState(initial ?? [])
  // Ranked feed → offset pagination: how many posts the server has already returned for this tab.
  const [loaded, setLoaded] = useState(initial?.length ?? 0)
  const [hasMore, setHasMore] = useState((initial?.length ?? 0) >= FEED_SIZE)
  // A page that failed to load: the feed says so and offers a retry (the observer does not fire again by itself).
  const [moreFailed, setMoreFailed] = useState(false)
  const [pending, start] = useTransition()
  const end = useRef<HTMLDivElement>(null)
  const last = clips.filter((c) => !c.uploading).at(-1)
  const scroller = useRef<HTMLDivElement>(null)
  const [choosing, setChoosing] = useState(false)

  const upload = (
    <UploadClip
      meId={meId}
      myTeamId={myTeamId}
      myNick={myNick}
      audience={audience}
      teamShort={teamShort}
      choosing={choosing}
      setChoosing={setChoosing}
      onStart={(local) => {
        // A post sent to the other tab is not shown here (it lives in that tab).
        if (local.audience !== audience) {
          if (local.url?.startsWith('blob:')) URL.revokeObjectURL(local.url)
          return
        }
        setClips((cur) => [local, ...cur])
        scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }}
      onDone={(localId, clip) =>
        setClips((cur) => {
          const local = cur.find((c) => c.id === localId)
          if (local?.url?.startsWith('blob:')) URL.revokeObjectURL(local.url)
          return clip ? cur.map((c) => (c.id === localId ? clip : c)) : cur.filter((c) => c.id !== localId)
        })
      }
    />
  )

  const loadMore = () =>
    start(async () => {
      const r = await loadMoreSquareAction({ offset: loaded, audience }).catch(() => null)
      const more = r?.data?.clips
      if (!more) {
        setMoreFailed(true)
        return
      }
      setMoreFailed(false)
      setLoaded((n) => n + more.length)
      setClips((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))])
      setHasMore(more.length >= FEED_SIZE)
    })

  useEffect(() => {
    const el = end.current
    if (!el || !hasMore || !last || moreFailed) return
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting || pending) return
      loadMore()
    })
    io.observe(el)
    return () => io.disconnect()
    // `loadMore` is recreated every render; the values above decide when to observe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, last, audience, pending, moreFailed])

  return (
    <div className="sq-root">
      <div className="sq-top">
        {tabs}
        {upload}
      </div>
      {initial === null && clips.length === 0 ? (
        <div className="sq-empty">
          <LoadError />
        </div>
      ) : clips.length === 0 ? (
        <div className="sq-empty">
          <span className="sq-empty-ico" aria-hidden="true">
            <ImagePlus className="size-7" strokeWidth={1.5} />
          </span>
          <p className="text-lg font-semibold">{empty}</p>
          <p className="text-sm text-muted">כל פוסט נעלם אחרי 24 שעות.</p>
          <button type="button" className="su-btn su-btn-green mt-3 max-w-64" onClick={() => setChoosing(true)}>
            העלה את הרגע הראשון
          </button>
        </div>
      ) : (
        <div ref={scroller} className="sq-scroller" aria-label="רילס">
          {clips.map((c) => (
            <ClipCard key={c.id} clip={c} meId={meId} myTeamId={myTeamId} onRemoved={(id) => setClips((cur) => cur.filter((x) => x.id !== id))} />
          ))}
          {hasMore && (
            <div ref={end} className="grid h-24 snap-start place-items-center text-sm text-muted">
              {moreFailed && last ? <LoadError compact onRetry={() => loadMore(last)} /> : pending ? 'טוען עוד…' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
