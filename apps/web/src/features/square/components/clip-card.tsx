'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Eye, Heart, MessageCircle, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { teamById } from '@/features/teams/data'
import { ReportBlock } from '@/features/safety/components/report-block'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { cn } from '@/lib/utils'
import { shortCount, timeLeftHe, type Clip, type ClipComment } from '../schema'
import { setSoundOn, useSoundOn } from '../sound'
import {
  addCommentAction,
  deleteClipAction,
  getCommentsAction,
  openOnceClipAction,
  toggleLikeAction,
  toggleRespectAction,
} from '../server/actions'

type Props = {
  clip: Clip
  meId: string
  myTeamId: string
  onRemoved: (id: string) => void
  /** Inside the home story viewer: a video plays once (no loop), reports its progress and says when it ended. */
  story?: { onEnded: () => void; onProgress: (fraction: number) => void }
}

export function ClipCard({ clip, meId, myTeamId, onRemoved, story }: Props) {
  const team = teamById(clip.team_id)
  const mine = clip.user_id === meId
  const rival = clip.team_id !== myTeamId
  const [url, setUrl] = useState(clip.url)
  const [liked, setLiked] = useState(clip.liked)
  const [likes, setLikes] = useState(clip.likes_count)
  const [respected, setRespected] = useState(clip.respected)
  const [respects, setRespects] = useState(clip.respects_count)
  const [comments, setComments] = useState<ClipComment[] | null>(null)
  const [commentCount, setCommentCount] = useState(clip.comments_count)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [now] = useState(() => Date.now())

  const toggle = (kind: 'like' | 'respect') => {
    const on = kind === 'like' ? !liked : !respected
    if (kind === 'like') {
      setLiked(on)
      setLikes((n) => n + (on ? 1 : -1))
    } else {
      setRespected(on)
      setRespects((n) => n + (on ? 1 : -1))
    }
    start(async () => {
      const r = await (kind === 'like' ? toggleLikeAction : toggleRespectAction)({ clipId: clip.id, on })
      if (!r.data?.ok) {
        // roll back the optimistic change
        if (kind === 'like') {
          setLiked(!on)
          setLikes((n) => n - (on ? 1 : -1))
        } else {
          setRespected(!on)
          setRespects((n) => n - (on ? 1 : -1))
        }
        setNote(r.data?.error ?? 'לא הצלחנו לשמור')
      }
    })
  }

  // Sound follows the fan's last choice across videos. A phone may refuse sound before the first tap on the page:
  // then the video plays silent and one tap turns the sound on (inside the tap, so the phone allows it).
  const soundOn = useSoundOn()
  const [blocked, setBlocked] = useState(false)
  const muted = !soundOn || blocked
  const media = useRef<HTMLVideoElement>(null)
  const toggleSound = () => {
    const v = media.current
    if (muted) {
      setBlocked(false)
      setSoundOn(true)
      if (v) {
        v.muted = false
        void v.play().catch(() => {})
      }
    } else setSoundOn(false)
  }
  const card = useRef<HTMLElement>(null)
  // A reel plays while it fills most of the screen and pauses when swiped away.
  useEffect(() => {
    const el = card.current
    const v = media.current
    if (!el || !v) return
    const play = () =>
      v.play().catch(() => {
        if (v.muted) return
        v.muted = true
        setBlocked(true)
        void v.play().catch(() => {})
      })
    const io = new IntersectionObserver(([e]) => (e && e.intersectionRatio > 0.7 ? void play() : v.pause()), {
      threshold: [0, 0.7, 1],
    })
    io.observe(el)
    return () => io.disconnect()
  }, [url])
  const canRespect = rival && clip.audience === 'all'

  return (
    <article ref={card} className="relative h-full snap-start snap-always overflow-hidden bg-black" aria-label={`פוסט של ${clip.nick}`}>
      {url ? (
        clip.kind === 'video' ? (
          <button type="button" onClick={toggleSound} className="absolute inset-0" aria-label={muted ? 'הפעל קול' : 'השתק'}>
            <video
              ref={media}
              src={url}
              muted={muted}
              loop={!story}
              playsInline
              preload="metadata"
              className="size-full object-contain"
              onEnded={story?.onEnded}
              onTimeUpdate={story ? (e) => story.onProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1)) : undefined}
            />
          </button>
        ) : (
          // Signed, short-lived Storage URL: next/image optimisation would cache it past its lifetime.
          // The whole photo is shown (no cropping); a blurred copy fills the bars around it, like Instagram.
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" loading="lazy" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={clip.caption || 'פוסט בכיכר'} className="absolute inset-0 size-full object-contain" loading="lazy" />
          </>
        )
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-elev">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await openOnceClipAction({ clipId: clip.id })
                if (r.data?.url) setUrl(r.data.url)
                else setNote(r.data?.error ?? 'לא הצלחנו לפתוח')
              })
            }
            className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface/80 px-6 py-5 text-sm"
          >
            <Eye className="size-7 text-accent-text" aria-hidden="true" />
            חד פעמי · הקש לצפייה
            <span className="text-xs text-muted">אחרי הצפייה הפוסט ייעלם בשבילך</span>
          </button>
        </div>
      )}

      {clip.uploading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/35" role="status">
          <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            מעלה…
          </span>
        </div>
      )}

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <header className="absolute inset-x-3 top-16 flex items-center gap-2 text-white">
        {team && <TeamScarf team={team} />}
        <b className="text-sm drop-shadow">{clip.nick}</b>
        <span className="text-xs text-white/70">{team?.short}</span>
        {clip.once && <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px]">חד פעמי</span>}
        <span className="ms-auto rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white/80">{timeLeftHe(clip.expires_at, now)}</span>
      </header>

      {clip.kind === 'video' && url && (
        <span className="pointer-events-none absolute top-[6.5rem] end-3 grid size-8 place-items-center rounded-full bg-black/45 text-white" aria-hidden="true">
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </span>
      )}

      <div className="absolute end-2 bottom-24 flex flex-col items-center gap-4 text-white" hidden={clip.uploading}>
        <button type="button" aria-pressed={liked} onClick={() => toggle('like')} className="flex flex-col items-center gap-0.5 text-xs font-bold">
          <span className="grid size-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm transition-transform active:scale-90">
            <Heart className={cn('size-6', liked && 'fill-live text-live')} aria-hidden="true" />
          </span>
          <span className="sr-only">לייק</span>
          {shortCount(likes)}
        </button>
        {clip.audience === 'all' && (
          <button
            type="button"
            aria-pressed={respected}
            aria-label={canRespect ? 'כבוד מאוהד יריב' : 'כבוד נותנים רק אוהדים של קבוצות אחרות'}
            disabled={!canRespect}
            onClick={() => toggle('respect')}
            className="flex flex-col items-center gap-0.5 text-xs font-bold disabled:opacity-60"
          >
            <span className={cn('grid size-11 place-items-center rounded-full bg-black/35 text-xl backdrop-blur-sm transition-transform active:scale-90', respected && 'ring-2 ring-warn')}>
              🤝
            </span>
            {shortCount(respects)}
          </button>
        )}
        <button
          type="button"
          aria-expanded={comments !== null}
          onClick={() =>
            comments ? setComments(null) : start(async () => setComments((await getCommentsAction({ clipId: clip.id })).data?.comments ?? []))
          }
          className="flex flex-col items-center gap-0.5 text-xs font-bold"
        >
          <span className="grid size-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm transition-transform active:scale-90">
            <MessageCircle className="size-6" aria-hidden="true" />
          </span>
          <span className="sr-only">תגובות</span>
          {shortCount(commentCount)}
        </button>
        {mine && (
          <button
            type="button"
            aria-label="מחק את הפוסט"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteClipAction({ clipId: clip.id })
                if (r.data?.ok) onRemoved(clip.id)
                else setNote('המחיקה נכשלה')
              })
            }
            className="grid size-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm"
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="absolute start-3 end-16 bottom-4 space-y-1 text-white">
        {clip.caption && <p className="text-sm leading-snug drop-shadow">{clip.caption}</p>}
        {clip.tags && <p className="text-xs font-semibold text-accent-text">{clip.tags}</p>}
        {clip.once && mine && <p className="text-xs text-white/70">{shortCount(clip.views_count)} צפו</p>}
        {!mine && <ReportBlock kind="clip" refId={clip.id} userId={clip.user_id} userNick={clip.nick} />}
        {note && (
          <p role="alert" className="text-xs text-live">
            {note}
          </p>
        )}
      </div>

      {comments && (
        <div className="absolute inset-x-0 bottom-0 max-h-[65%] space-y-2 overflow-y-auto rounded-t-3xl border-t border-line bg-surface-2/95 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <b className="text-sm">תגובות</b>
            <button type="button" aria-label="סגור תגובות" onClick={() => setComments(null)} className="grid size-9 place-items-center text-muted">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {comments.length === 0 && <p className="text-xs text-muted">עוד אין תגובות.</p>}
          <ul className="space-y-1.5">
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                <b className="text-accent-text">{c.nick}</b> {c.body}
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const body = draft.trim()
              if (!body) return
              start(async () => {
                const r = await addCommentAction({ clipId: clip.id, body })
                const c = r.data?.comment
                if (c) {
                  setComments((cur) => [...(cur ?? []), c])
                  setCommentCount((n) => n + 1)
                  setDraft('')
                } else setNote(r.data?.error ?? 'התגובה לא נשלחה')
              })
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={150}
              placeholder="תגובה…"
              aria-label="תגובה"
              className="min-w-0 flex-1 rounded-md border border-line bg-elev px-3 py-2 text-sm"
            />
            <button type="submit" disabled={pending || !draft.trim()} className="rounded-md bg-accent px-3 text-sm text-white disabled:opacity-40">
              שלח
            </button>
          </form>
        </div>
      )}
    </article>
  )
}
