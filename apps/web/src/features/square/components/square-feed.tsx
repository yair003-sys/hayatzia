'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { FEED_SIZE, type Audience, type Clip } from '../schema'
import { loadMoreSquareAction } from '../server/actions'
import { ClipCard } from './clip-card'
import { UploadClip } from './upload-clip'

type Props = { initial: Clip[]; meId: string; myTeamId: string; myNick: string; teamShort: string; audience: Audience; empty: string }

/** Reels: one post per screen, swipe up for the next; the next page loads as the last post comes into view. */
export function SquareFeed({ initial, meId, myTeamId, myNick, teamShort, audience, empty }: Props) {
  const [clips, setClips] = useState(initial)
  const [hasMore, setHasMore] = useState(initial.length >= FEED_SIZE)
  const [pending, start] = useTransition()
  const end = useRef<HTMLDivElement>(null)
  const last = clips.filter((c) => !c.uploading).at(-1)
  const scroller = useRef<HTMLDivElement>(null)

  const upload = (
    <UploadClip
      meId={meId}
      myTeamId={myTeamId}
      myNick={myNick}
      audience={audience}
      teamShort={teamShort}
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

  if (clips.length === 0) {
    return (
      <>
        {upload}
        <p className="grid h-[60dvh] place-items-center rounded-3xl border border-line-soft bg-surface px-6 text-center text-muted">{empty}</p>
      </>
    )
  }

  return (
    <>
    {upload}
    <div
      ref={scroller}
      className="-mx-4 h-[calc(100dvh-15rem)] min-h-[26rem] snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]"
      aria-label="רילס"
    >
      {clips.map((c) => (
        <ClipCard
          key={c.id}
          clip={c}
          meId={meId}
          myTeamId={myTeamId}
          onRemoved={(id) => setClips((cur) => cur.filter((x) => x.id !== id))}
        />
      ))}
      {hasMore && (
        <div ref={end} className="grid h-24 snap-start place-items-center text-sm text-muted">
          {pending ? 'טוען עוד…' : ''}
        </div>
      )}
    </div>
    </>
  )
}
