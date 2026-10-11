'use client'

import { useState, useTransition } from 'react'
import { FEED_SIZE, type Clip } from '../schema'
import { loadMoreSquareAction } from '../server/actions'
import { ClipCard } from './clip-card'

type Props = { initial: Clip[]; meId: string; myTeamId: string; mine: boolean }

export function SquareFeed({ initial, meId, myTeamId, mine }: Props) {
  const [clips, setClips] = useState(initial)
  const [hasMore, setHasMore] = useState(initial.length >= FEED_SIZE)
  const [pending, start] = useTransition()

  const last = clips.at(-1)

  if (clips.length === 0) {
    return <p className="py-12 text-center text-muted">הכיכר ריקה כרגע. תהיה הראשון להעלות 📸</p>
  }

  return (
    <div className="space-y-4">
      {clips.map((c) => (
        <ClipCard
          key={c.id}
          clip={c}
          meId={meId}
          myTeamId={myTeamId}
          onRemoved={(id) => setClips((cur) => cur.filter((x) => x.id !== id))}
        />
      ))}
      {hasMore && last && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await loadMoreSquareAction({ createdAt: last.created_at, id: last.id, mine })
              const more = r.data?.clips ?? []
              setClips((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))])
              setHasMore(more.length >= FEED_SIZE)
            })
          }
          className="w-full rounded-lg border border-line py-3 text-sm text-muted disabled:opacity-50"
        >
          {pending ? 'טוען…' : 'עוד מהכיכר'}
        </button>
      )}
    </div>
  )
}
