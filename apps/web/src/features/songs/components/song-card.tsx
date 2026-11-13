'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Heart, Megaphone, Pause, Play, Trash2 } from 'lucide-react'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { teamById } from '@/features/teams/data'
import { shortCount } from '@/features/square/schema'
import { cn } from '@/lib/utils'
import type { Song } from '../schema'
import { deleteSongAction, toggleAdoptAction, toggleSongLikeAction } from '../server/actions'

/** One song in the greenhouse: play the recording, read the lyrics, like it, and — the whole point — adopt it. */
export function SongCard({ song, meId, onRemoved }: { song: Song; meId: string; onRemoved: (id: string) => void }) {
  const mine = song.user_id === meId
  const team = teamById(song.team_id)
  const [liked, setLiked] = useState(song.liked)
  const [likes, setLikes] = useState(song.likes_count)
  const [adopted, setAdopted] = useState(song.adopted)
  const [adopts, setAdopts] = useState(song.adopts_count)
  const [playing, setPlaying] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const audio = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) void a.play().catch(() => setNote('לא הצלחנו לנגן'))
    else a.pause()
  }

  const like = () => {
    const on = !liked
    setLiked(on)
    setLikes((n) => n + (on ? 1 : -1))
    start(async () => {
      const r = await toggleSongLikeAction({ songId: song.id, on })
      if (!r.data?.ok) {
        setLiked(!on)
        setLikes((n) => n - (on ? 1 : -1))
      }
    })
  }

  const adopt = () => {
    const on = !adopted
    setAdopted(on)
    setAdopts((n) => n + (on ? 1 : -1))
    start(async () => {
      const r = await toggleAdoptAction({ songId: song.id, on })
      if (!r.data?.ok) {
        setAdopted(!on)
        setAdopts((n) => n - (on ? 1 : -1))
        setNote(r.data?.error ?? 'לא הצלחנו לאמץ')
      }
    })
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-surface">
      {song.uploading && (
        <div className="flex items-center gap-2 bg-accent-soft px-4 py-2 text-xs font-bold text-accent-text">
          <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          מעלה את השיר…
        </div>
      )}

      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!song.url}
          aria-label={playing ? 'עצור' : 'נגן'}
          className="grid size-14 shrink-0 place-items-center rounded-2xl text-[var(--acc-on,#fff)] shadow-lg transition-transform active:scale-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(150deg, var(--acc2, var(--color-accent-2)), var(--acc, var(--color-accent)))' }}
        >
          {playing ? <Pause className="size-6" aria-hidden="true" /> : <Play className="size-6 translate-x-0.5" aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1">
          {song.title && <h3 className="truncate text-base font-extrabold">{song.title}</h3>}
          <Link href={`/fans/${song.user_id}`} className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            {team && <TeamScarf team={team} className="h-4 w-1.5" />}
            <span className="font-semibold text-fg">{song.nick}</span>
            <span>כתב/ה</span>
          </Link>
        </div>

        {mine && (
          <button
            type="button"
            aria-label="מחק שיר"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteSongAction({ songId: song.id })
                if (r.data?.ok) onRemoved(song.id)
                else setNote('המחיקה נכשלה')
              })
            }
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {song.lyrics && (
        <p className="whitespace-pre-line px-4 text-[15px] leading-relaxed text-fg/90">{song.lyrics}</p>
      )}

      {/* the adoption counter — the heart of the greenhouse */}
      {adopts > 0 && (
        <p className="mt-3 px-4 text-sm font-bold text-accent-text">
          🔥 {shortCount(adopts)} אוהדים אימצו את השיר הזה
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 p-4 pt-0">
        <button
          type="button"
          onClick={adopt}
          aria-pressed={adopted}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition-transform active:scale-[0.98]',
            adopted ? 'border border-line bg-surface-2 text-fg' : 'text-[var(--acc-on,#fff)]',
          )}
          style={adopted ? undefined : { background: 'linear-gradient(150deg, var(--acc2, var(--color-accent-2)), var(--acc, var(--color-accent)))' }}
        >
          <Megaphone className="size-5" aria-hidden="true" />
          {adopted ? 'אימצת — נשיר ביחד ✓' : 'אמץ שיר'}
        </button>

        <button
          type="button"
          onClick={like}
          aria-pressed={liked}
          className="flex min-w-16 flex-col items-center gap-0.5 rounded-2xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold"
        >
          <Heart className={cn('size-5', liked && 'fill-live text-live')} aria-hidden="true" />
          {shortCount(likes)}
        </button>
      </div>

      {note && (
        <p role="alert" className="px-4 pb-3 text-xs text-live">
          {note}
        </p>
      )}

      {song.url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          ref={audio}
          src={song.url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </article>
  )
}
