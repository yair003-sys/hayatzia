'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, Flag, Heart, MessageCircle, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { teamById } from '@/features/teams/data'
import { ReportBlock, ReportForm } from '@/features/safety/components/report-block'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { cn } from '@/lib/utils'
import { shortCount, timeLeftHe, type Clip, type ClipComment } from '../schema'
import { CaptionLayer } from './caption-layer'
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
  const t = useTranslations('square')
  const team = teamById(clip.team_id)
  const mine = clip.user_id === meId
  const rival = clip.team_id !== myTeamId
  const [url, setUrl] = useState(clip.url)
  // Fill the screen (cover) for the usual upright clip; only a landscape one (phone turned sideways) is letterboxed.
  const [landscape, setLandscape] = useState(false)
  const [liked, setLiked] = useState(clip.liked)
  const [likes, setLikes] = useState(clip.likes_count)
  const [respected, setRespected] = useState(clip.respected)
  const [respects, setRespects] = useState(clip.respects_count)
  const [comments, setComments] = useState<ClipComment[] | null>(null)
  const [commentCount, setCommentCount] = useState(clip.comments_count)
  const [draft, setDraft] = useState('')
  // The comment being reported (its id), and the line shown after a report.
  const [reportingComment, setReportingComment] = useState<string | null>(null)
  const [commentNote, setCommentNote] = useState<string | null>(null)
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
        setNote(r.data?.error ?? t('saveFailed'))
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
    // On-device edits (owner 2026-10-18): playback speed, and a trim window that loops in the feed.
    const start = clip.trim_start || 0
    v.playbackRate = clip.speed || 1
    const onMeta = () => {
      v.playbackRate = clip.speed || 1
      if (start) v.currentTime = start
    }
    const onTime = () => {
      const end = clip.trim_end ?? v.duration
      if (!story && end && (v.currentTime < start - 0.05 || v.currentTime >= end)) v.currentTime = start
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTime)
    const play = () => {
      v.playbackRate = clip.speed || 1
      return v.play().catch(() => {
        if (v.muted) return
        v.muted = true
        setBlocked(true)
        void v.play().catch(() => {})
      })
    }
    const io = new IntersectionObserver(([e]) => (e && e.intersectionRatio > 0.7 ? void play() : v.pause()), {
      threshold: [0, 0.7, 1],
    })
    io.observe(el)
    // Pause when the tab/app is backgrounded, and — importantly — on unmount (leaving the Square), so the video never
    // keeps playing sound in the background after the fan swipes or navigates away.
    const onHidden = () => {
      if (document.hidden) v.pause()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onHidden)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTime)
      v.pause()
    }
  }, [url, clip.speed, clip.trim_start, clip.trim_end, story])
  const canRespect = rival && clip.audience === 'all'

  return (
    <article ref={card} className="relative h-full snap-start snap-always overflow-hidden bg-black" aria-label={t('postOf', { nick: clip.nick })}>
      {url ? (
        clip.kind === 'video' ? (
          <button type="button" onClick={toggleSound} className="absolute inset-0" aria-label={muted ? t('soundOn') : t('mute')}>
            <video
              ref={media}
              src={url}
              muted={muted}
              loop={!story}
              playsInline
              preload="metadata"
              className={cn('size-full', landscape ? 'object-contain' : 'object-cover', `filt-${clip.filter}`)}
              onLoadedMetadata={(e) => setLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
              onEnded={story?.onEnded}
              onTimeUpdate={story ? (e) => story.onProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1)) : undefined}
            />
          </button>
        ) : (
          // Upright photos fill the screen (cover); a landscape one keeps its shape over a blurred copy of itself.
          <>
            {landscape && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" loading="lazy" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={clip.caption || t('squarePost')}
              className={cn('absolute inset-0 size-full', landscape ? 'object-contain' : 'object-cover', `filt-${clip.filter}`)}
              loading="lazy"
              onLoad={(e) => setLandscape(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)}
            />
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
                else setNote(r.data?.error ?? t('openFailed'))
              })
            }
            className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface/80 px-6 py-5 text-sm"
          >
            <Eye className="size-7 text-accent-text" aria-hidden="true" />
            {t('onceTapToView')}
            <span className="text-xs text-muted">{t('onceDisappears')}</span>
          </button>
        </div>
      )}

      {url && clip.captions && clip.captions.length > 0 && <CaptionLayer captions={clip.captions} />}

      {clip.uploading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/35" role="status">
          <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            {t('uploading')}
          </span>
        </div>
      )}

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <header className="absolute inset-x-3 top-16 flex items-center gap-2 text-white">
        {team && <TeamScarf team={team} />}
        <b className="text-sm drop-shadow">{clip.nick}</b>
        <span className="text-xs text-white/70">{team?.short}</span>
        {clip.once && <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px]">{t('onceBadge')}</span>}
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
          <span className="sr-only">{t('likeSr')}</span>
          {shortCount(likes)}
        </button>
        {clip.audience === 'all' && (
          <button
            type="button"
            aria-pressed={respected}
            aria-label={canRespect ? t('respectRival') : t('respectOnlyOthers')}
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
          <span className="sr-only">{t('comments')}</span>
          {shortCount(commentCount)}
        </button>
        {mine && (
          <button
            type="button"
            aria-label={t('deletePost')}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteClipAction({ clipId: clip.id })
                if (r.data?.ok) onRemoved(clip.id)
                else setNote(t('deleteFailed'))
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
        {clip.once && mine && <p className="text-xs text-white/70">{t('viewed', { count: shortCount(clip.views_count) })}</p>}
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
            <b className="text-sm">{t('comments')}</b>
            <button type="button" aria-label={t('closeComments')} onClick={() => setComments(null)} className="grid size-9 place-items-center text-muted">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {comments.length === 0 && <p className="text-xs text-muted">{t('noComments')}</p>}
          <ul className="space-y-1.5">
            {comments.map((c) => (
              <li key={c.id} className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words">
                    <b className="text-accent-text">{c.nick}</b> {c.body}
                  </p>
                  {c.user_id !== meId && (
                    <button
                      type="button"
                      onClick={() => {
                        setCommentNote(null)
                        setReportingComment(reportingComment === c.id ? null : c.id)
                      }}
                      aria-expanded={reportingComment === c.id}
                      aria-label={t('reportComment', { nick: c.nick })}
                      className="-my-2 flex min-h-11 shrink-0 items-center gap-1 px-1 text-xs text-muted"
                    >
                      <Flag className="size-3.5" aria-hidden="true" />
                      {t('report')}
                    </button>
                  )}
                </div>
                {reportingComment === c.id && (
                  <ReportForm
                    kind="clip_comment"
                    refId={c.id}
                    onDone={(m) => {
                      setReportingComment(null)
                      setCommentNote(m)
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {commentNote && (
            <p role="status" className="text-xs text-muted">
              {commentNote}
            </p>
          )}
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
                } else setNote(r.data?.error ?? t('commentFailed'))
              })
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={150}
              placeholder={t('commentPlaceholder')}
              aria-label={t('commentLabel')}
              className="min-w-0 flex-1 rounded-md border border-line bg-elev px-3 py-2 text-sm"
            />
            <button type="submit" disabled={pending || !draft.trim()} className="rounded-md bg-accent px-3 text-sm text-white disabled:opacity-40">
              {t('send')}
            </button>
          </form>
        </div>
      )}
    </article>
  )
}
