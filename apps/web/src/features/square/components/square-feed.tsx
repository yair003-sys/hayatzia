'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ImagePlus } from 'lucide-react'
import { FEED_SIZE, type Audience, type Clip } from '../schema'
import { loadMoreSquareAction } from '../server/actions'
import { ClipCard } from './clip-card'
import { UploadClip } from './upload-clip'

type Props = { initial: Clip[]; meId: string; myTeamId: string; myNick: string; teamShort: string; audience: Audience; empty: string; tabs: ReactNode }

/** Reels: one post per screen, swipe up for the next; the next page loads as the last post comes into view. */
export function SquareFeed({ initial, meId, myTeamId, myNick, teamShort, audience, empty, tabs }: Props) {
  const [clips, setClips] = useState(initial)
  const [hasMore, setHasMore] = useState(initial.length >= FEED_SIZE)
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

  useEffect(() => {
    const el = end.current
    if (!el || !hasMore || !last) return
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting || pending) return
      start(async () => {
        const r = await loadMoreSquareAction({ createdAt: last.created_at, id: last.id, audience })
        const more = r.data?.clips ?? []
        setClips((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))])
        setHasMore(more.length >= FEED_SIZE)
      })
    })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, last, audience, pending])

  return (
    <div className="sq-root">
      <div className="sq-top">
        {tabs}
        {upload}
      </div>
      {clips.length === 0 ? (
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
              {pending ? 'טוען עוד…' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
