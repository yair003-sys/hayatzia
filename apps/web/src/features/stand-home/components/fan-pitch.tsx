'use client'

import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { average, positionGroup, type PlayerRow, type Review } from '@/features/ratings/schema'
import { ratePlayerAction, reviewsAction } from '@/features/ratings/server/actions'
import type { Team } from '@/features/teams/data'
import { cardTier, splitPitch } from '../schema'

/** Legacy "ההרכב של האוהדים": the sample XI on a pitch as rating cards, the rest on a bench. Tap to rate. */
export function FanPitch({ team, initial }: { team: Team; initial: PlayerRow[] }) {
  const [players, setPlayers] = useState(initial)
  const [open, setOpen] = useState<PlayerRow | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const { xi, bench } = splitPitch(players)
  const card = (p: PlayerRow, style?: CSSProperties) => (
    <PlayerCard key={p.id} p={p} team={team} style={style} onOpen={() => setOpen(p)} />
  )
  return (
    <div className="space-y-3">
      {xi.length > 0 ? (
        <div className="sh-pitch">
          <div className="sh-lines" aria-hidden="true">
            <i className="mid" />
            <i className="c" />
            <i className="box t" style={{ top: -1.5 }} />
            <i className="box b" style={{ bottom: -1.5 }} />
            <i className="six t" style={{ top: -1.5 }} />
            <i className="six b" style={{ bottom: -1.5 }} />
          </div>
          <span className="sh-pitch-tag">4-3-3 · לדוגמה</span>
          {xi.map((p) => card(p, { left: `${p.pitch_x}%`, top: `${p.pitch_y}%` }))}
        </div>
      ) : (
        <p className="rounded-lg border border-line-soft p-4 text-center text-sm text-muted">אין עדיין הרכב לקבוצה.</p>
      )}
      <div className="flex items-baseline justify-between font-display font-bold">
        <span>ספסל</span>
        <small className="text-[11.5px] font-normal text-dim">גוללים הצידה · לחיצה על שחקן לדירוג</small>
      </div>
      <div className="sh-bench">{bench.map((p) => card(p))}</div>
      <p className="rounded-xl border border-line-soft bg-white/2 px-4 py-3 text-[13px] leading-relaxed text-muted">
        הדירוג הוא ממוצע אמיתי של אוהדי {team.short}. כל אוהד מדרג כל שחקן פעם אחת ויכול לעדכן. ההרכב על המגרש הוא דוגמה.
      </p>
      {open && (
        <RatingSheet
          p={open}
          onClose={close}
          onRated={(next) => {
            setPlayers((cur) => cur.map((x) => (x.id === next.id ? next : x)))
            setOpen(next)
          }}
        />
      )}
    </div>
  )
}

function PlayerCard({ p, team, style, onOpen }: { p: PlayerRow; team: Team; style?: CSSProperties; onOpen: () => void }) {
  const coach = positionGroup(p.position).order === 4
  const filled = Math.round(p.avg ?? 0)
  return (
    <button
      type="button"
      className="sh-pc"
      data-tier={cardTier(p.avg)}
      data-rated={p.myStars !== null}
      style={style}
      onClick={onOpen}
      aria-label={`${p.name_he}, דירוג ${p.avg ?? 'אין'}${p.myStars ? `, הדירוג שלך ${p.myStars}` : ''}`}
    >
      <span className="sh-pc-in">
        <span className="r">{p.avg === null ? '–' : p.avg.toFixed(1)}</span>
        <span className="p">{coach ? 'HC' : p.position}</span>
        <svg className="kit" viewBox="0 0 28 26" aria-hidden="true">
          {coach ? (
            <path d="M14 3a5 5 0 1 1 0 10a5 5 0 0 1 0-10Zm-9 21c0-5 4-8 9-8s9 3 9 8Z" fill={team.bg} stroke={team.ring} strokeWidth="1.2" />
          ) : (
            <>
              <path d="M9 2 4 4 1 10l4 2v12h18V12l4-2-3-6-5-2c-1 2-3 3-5 3S10 4 9 2Z" fill={team.bg} stroke={team.ring} strokeWidth="1.2" />
              <text x="14" y="19" textAnchor="middle" fontSize="9" fontWeight="900" fill={team.ring}>
                {p.number ?? ''}
              </text>
            </>
          )}
        </svg>
        <span className="n">{p.name_short}</span>
        <span className="s" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} style={{ opacity: n <= filled ? 1 : 0.25 }}>
              ★
            </span>
          ))}
        </span>
      </span>
      {p.myStars !== null && <span className="me">{p.myStars}★</span>}
      {p.injured && (
        <span className="inj" aria-hidden="true">
          +
        </span>
      )}
    </button>
  )
}

function RatingSheet({ p, onClose, onRated }: { p: PlayerRow; onClose: () => void; onRated: (p: PlayerRow) => void }) {
  const [stars, setStars] = useState(p.myStars ?? 0)
  const [review, setReview] = useState(p.myReview)
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)

  // Modal behaviour: focus inside on open, Escape closes, Tab stays inside, focus returns to the card on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>('button, textarea')].filter((el) => !el.hasAttribute('disabled'))
      const first = items[0]
      const last = items.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [onClose])

  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await reviewsAction({ playerId: p.id })
      if (alive) setReviews(r.data?.reviews ?? [])
    })()
    return () => {
      alive = false
    }
  }, [p.id])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`דירוג ${p.name_he}`} onClick={onClose}>
      <div
        ref={panel}
        className="w-full max-w-md space-y-3 rounded-t-3xl border border-line bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] motion-safe:animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-black">
            {p.number !== null && <span className="me-2 text-muted tabular-nums">{p.number}</span>}
            {p.name_he}
          </h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="סגור" className="grid size-10 place-items-center rounded-full text-muted">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-muted">
          ממוצע {p.avg ?? '–'} · {p.count} מדרגים
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="הדירוג שלך">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={stars === n} aria-label={`${n} כוכבים`} onClick={() => setStars(n)} className="p-1">
              <Star className={cn('size-8', n <= stars ? 'fill-warn text-warn' : 'text-dim')} aria-hidden="true" />
            </button>
          ))}
        </div>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="מה דעתך עליו? (לא חובה)"
          aria-label="ביקורת"
          className="w-full rounded-md border border-line bg-elev px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending || stars === 0}
          onClick={() =>
            start(async () => {
              const r = await ratePlayerAction({ playerId: p.id, stars, review })
              if (!r.data?.ok) return setMsg(r.data?.error ?? r.serverError ?? 'השמירה נכשלה')
              const prev = r.data.previous
              const sum = (p.avg ?? 0) * p.count - (prev ?? 0) + stars
              const count = p.count + (prev === null ? 1 : 0)
              onRated({ ...p, myStars: stars, myReview: review.trim(), count, avg: average(sum, count) })
              setMsg('נשמר ✓')
            })
          }
          className="w-full rounded-xl py-3 font-bold disabled:opacity-40"
          style={{ background: 'linear-gradient(180deg, var(--acc2), var(--acc))', color: 'var(--acc-on)' }}
        >
          {p.myStars ? 'עדכן דירוג' : 'שמור דירוג'}
        </button>
        {msg && (
          <p role="status" className="text-xs text-muted">
            {msg}
          </p>
        )}
        {reviews && reviews.length > 0 && (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto" aria-label="ביקורות אחרונות">
            {reviews.map((r) => (
              <li key={r.user_id} className="text-sm">
                <b className="text-accent-text">{r.nick}</b> <span className="text-warn">{'★'.repeat(r.stars)}</span> {r.review}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
