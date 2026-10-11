'use client'

import { useState, useTransition } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { average, positionGroup, type PlayerRow, type Review } from '../schema'
import { ratePlayerAction, reviewsAction } from '../server/actions'

export function SquadRatings({ initial }: { initial: PlayerRow[] }) {
  const [players, setPlayers] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)

  const groups = new Map<string, PlayerRow[]>()
  for (const p of players) {
    const g = positionGroup(p.position).label
    groups.set(g, [...(groups.get(g) ?? []), p])
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([label, list]) => (
        <section key={label} aria-label={label} className="space-y-2">
          <h2 className="text-sm font-bold text-muted">{label}</h2>
          <ul className="space-y-2">
            {list.map((p) => (
              <li key={p.id}>
                <PlayerItem
                  player={p}
                  open={openId === p.id}
                  onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                  onRated={(next) => setPlayers((cur) => cur.map((x) => (x.id === next.id ? next : x)))}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PlayerItem(props: {
  player: PlayerRow
  open: boolean
  onToggle: () => void
  onRated: (p: PlayerRow) => void
}) {
  const { player: p, open } = props
  const [stars, setStars] = useState(p.myStars ?? 0)
  const [review, setReview] = useState(p.myReview)
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const coach = positionGroup(p.position).order === 4

  return (
    <div className="rounded-lg border border-line-soft bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          props.onToggle()
          if (!open && reviews === null) start(async () => setReviews((await reviewsAction({ playerId: p.id })).data?.reviews ?? []))
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-start"
      >
        <span className="w-7 text-center font-display font-black tabular-nums text-muted">{p.number ?? ''}</span>
        <span className="flex-1">
          <b>{p.name_he}</b>
          {p.injured && <span className="ms-2 text-xs text-live">פצוע</span>}
          {p.in_xi && <span className="ms-2 text-xs text-ok">הרכב</span>}
        </span>
        <span className="flex items-center gap-1 text-sm tabular-nums">
          <Star className="size-4 fill-warn text-warn" aria-hidden="true" />
          {p.avg ?? '–'}
          <span className="text-xs text-dim">({p.count})</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line-soft px-3 py-3">
          <div className="flex items-center gap-1" role="radiogroup" aria-label={`הדירוג שלך ל${p.name_short}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} כוכבים`}
                onClick={() => setStars(n)}
                className="p-1"
              >
                <Star className={cn('size-7', n <= stars ? 'fill-warn text-warn' : 'text-dim')} aria-hidden="true" />
              </button>
            ))}
          </div>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={coach ? 'מה דעתך על המאמן? (לא חובה)' : 'מה דעתך עליו? (לא חובה)'}
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
                props.onRated({ ...p, myStars: stars, myReview: review.trim(), count, avg: average(sum, count) })
                setMsg('נשמר ✓')
                setReviews((await reviewsAction({ playerId: p.id })).data?.reviews ?? [])
              })
            }
            className="w-full rounded-lg bg-accent py-2.5 font-semibold text-white disabled:opacity-40"
          >
            {p.myStars ? 'עדכן דירוג' : 'שמור דירוג'}
          </button>
          {msg && (
            <p role="status" className="text-xs text-muted">
              {msg}
            </p>
          )}
          {reviews && reviews.length > 0 && (
            <ul className="space-y-1.5" aria-label="ביקורות אחרונות">
              {reviews.map((r) => (
                <li key={r.user_id} className="text-sm">
                  <b className="text-accent-text">{r.nick}</b> <span className="text-warn">{'★'.repeat(r.stars)}</span> {r.review}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
