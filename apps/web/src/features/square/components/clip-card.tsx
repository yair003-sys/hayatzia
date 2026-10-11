'use client'

import { useState, useTransition } from 'react'
import { Eye, Heart, MessageCircle, Trash2 } from 'lucide-react'
import { teamById } from '@/features/teams/data'
import { ReportBlock } from '@/features/safety/components/report-block'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { cn } from '@/lib/utils'
import { shortCount, timeLeftHe, type Clip, type ClipComment } from '../schema'
import {
  addCommentAction,
  deleteClipAction,
  getCommentsAction,
  openOnceClipAction,
  toggleLikeAction,
  toggleRespectAction,
} from '../server/actions'

type Props = { clip: Clip; meId: string; myTeamId: string; onRemoved: (id: string) => void }

export function ClipCard({ clip, meId, myTeamId, onRemoved }: Props) {
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

  return (
    <article className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      <header className="flex items-center gap-2 px-3 py-2.5">
        {team && <TeamScarf team={team} />}
        <b className="text-sm">{clip.nick}</b>
        <span className="text-xs text-muted">{team?.short}</span>
        <span className="ms-auto text-xs text-dim">{timeLeftHe(clip.expires_at, now)}</span>
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
            className="text-dim hover:text-live"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="relative grid aspect-[4/5] place-items-center bg-elev">
        {url ? (
          clip.kind === 'video' ? (
            <video src={url} controls playsInline preload="metadata" className="size-full object-contain" />
          ) : (
            // Signed, short-lived Storage URL: next/image optimisation would cache it past its lifetime.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={clip.caption || 'פוסט בכיכר'} className="size-full object-contain" loading="lazy" />
          )
        ) : (
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
            className="flex flex-col items-center gap-2 rounded-lg border border-line px-6 py-4 text-sm"
          >
            <Eye className="size-6 text-accent-text" aria-hidden="true" />
            חד פעמי · הקש לצפייה
            <span className="text-xs text-muted">אחרי הצפייה הפוסט ייעלם בשבילך</span>
          </button>
        )}
        {clip.once && url && (
          <span className="absolute top-2 start-2 rounded-full bg-canvas/80 px-2 py-0.5 text-xs">חד פעמי</span>
        )}
      </div>

      <div className="space-y-2 px-3 py-2.5">
        {clip.caption && <p className="text-sm">{clip.caption}</p>}
        {clip.tags && <p className="text-xs text-accent-text">{clip.tags}</p>}
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            aria-pressed={liked}
            onClick={() => toggle('like')}
            className={cn('flex items-center gap-1', liked ? 'text-live' : 'text-muted')}
          >
            <Heart className={cn('size-5', liked && 'fill-current')} aria-hidden="true" />
            <span className="sr-only">לייק</span>
            {shortCount(likes)}
          </button>
          {rival ? (
            <button
              type="button"
              aria-pressed={respected}
              aria-label="כבוד מאוהד יריב"
              onClick={() => toggle('respect')}
              className={cn('flex items-center gap-1', respected ? 'text-warn' : 'text-muted')}
            >
              <span aria-hidden="true">🤝</span>
              {shortCount(respects)}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-dim" title="כבוד נותנים רק אוהדים של קבוצות אחרות">
              <span aria-hidden="true">🤝</span>
              {shortCount(respects)}
            </span>
          )}
          <button
            type="button"
            aria-expanded={comments !== null}
            onClick={() =>
              comments
                ? setComments(null)
                : start(async () => setComments((await getCommentsAction({ clipId: clip.id })).data?.comments ?? []))
            }
            className="flex items-center gap-1 text-muted"
          >
            <MessageCircle className="size-5" aria-hidden="true" />
            <span className="sr-only">תגובות</span>
            {shortCount(commentCount)}
          </button>
          {clip.once && mine && <span className="ms-auto text-xs text-dim">{shortCount(clip.views_count)} צפו</span>}
        </div>

        {comments && (
          <div className="space-y-2 border-t border-line-soft pt-2">
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
        {!mine && <ReportBlock kind="clip" refId={clip.id} userId={clip.user_id} userNick={clip.nick} />}
        {note && (
          <p role="alert" className="text-xs text-live">
            {note}
          </p>
        )}
      </div>
    </article>
  )
}
