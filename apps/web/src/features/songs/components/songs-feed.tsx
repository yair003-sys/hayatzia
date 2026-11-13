'use client'

import { useState, useTransition } from 'react'
import { Mic, Music2 } from 'lucide-react'
import { LoadError } from '@/components/load-error'
import { SONGS_PAGE, type Song } from '../schema'
import { loadMoreSongsAction } from '../server/actions'
import { SongCard } from './song-card'
import { SongComposer } from './song-composer'

/** `initial` null = the first page could not be read: "could not load" with a retry, never "empty". */
export function SongsFeed({ initial, meId, teamShort }: { initial: Song[] | null; meId: string; teamShort: string }) {
  const [songs, setSongs] = useState<Song[]>(initial ?? [])
  const [loaded, setLoaded] = useState(initial?.length ?? 0)
  const [hasMore, setHasMore] = useState((initial?.length ?? 0) >= SONGS_PAGE)
  const [composing, setComposing] = useState(false)
  const [pending, start] = useTransition()

  const loadMore = () =>
    start(async () => {
      const r = await loadMoreSongsAction({ offset: loaded })
      const more = r.data?.songs ?? []
      setLoaded((n) => n + more.length)
      setSongs((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))])
      setHasMore(more.length >= SONGS_PAGE)
    })

  if (initial === null && songs.length === 0) return <LoadError />

  return (
    <div className="space-y-4">
      {composing ? (
        <SongComposer
          meId={meId}
          onClose={() => setComposing(false)}
          onPublished={(s) => {
            setSongs((cur) => [s, ...cur])
            setComposing(false)
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold text-[var(--acc-on,#fff)]"
          style={{ background: 'linear-gradient(150deg, var(--acc2, var(--color-accent-2)), var(--acc, var(--color-accent)))' }}
        >
          <Mic className="size-5" aria-hidden="true" />
          העלה שיר שכתבת
        </button>
      )}

      {songs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted" aria-hidden="true">
            <Music2 className="size-7" strokeWidth={1.5} />
          </span>
          <p className="text-lg font-bold">עוד אין שירים בחממה של {teamShort}</p>
          <p className="text-sm text-muted">הקליטו שיר שכתבתם, והאוהדים יאמצו אותו ליציע.</p>
        </div>
      ) : (
        songs.map((s) => <SongCard key={s.id} song={s} meId={meId} onRemoved={(id) => setSongs((cur) => cur.filter((x) => x.id !== id))} />)
      )}

      {hasMore && songs.length > 0 && (
        <button type="button" onClick={loadMore} disabled={pending} className="w-full rounded-2xl border border-line py-2.5 text-sm text-muted">
          {pending ? '…' : 'טען עוד'}
        </button>
      )}
    </div>
  )
}
