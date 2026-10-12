'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { MotmRow } from '../server/queries'
import { rateMatchAction } from '../server/actions'

type SquadRow = Omit<MotmRow, 'avg' | 'count' | 'mine'>
type Props = { fixtureId: number; canRate: boolean; squad: SquadRow[]; ranking: MotmRow[]; mine: Record<string, number>; teamShort: string }

/** After the final whistle: rate your club's players 1–10, then the fans' player of the match as a gold card. */
export function MotmPanel({ fixtureId, canRate, squad, ranking, mine, teamShort }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>(mine)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const rated = Object.keys(mine).length > 0
  const top = ranking[0]

  return (
    <section id="motm" aria-labelledby="motm-title" className="space-y-3">
      <h3 id="motm-title" className="sh-sec">
        🏆 שחקן המשחק
      </h3>
      {top ? (
        <div className="relative overflow-hidden rounded-3xl border border-warn/40 bg-[radial-gradient(120%_80%_at_50%_0%,rgb(245_183_0/.28),transparent_60%),linear-gradient(180deg,var(--color-surface-2),var(--color-surface))] p-5 text-center">
          <span className="text-[11px] font-bold tracking-widest text-warn">שחקן המשחק של אוהדי {teamShort}</span>
          <div className="mx-auto my-3 grid size-28 place-items-center rounded-[28%] bg-[linear-gradient(160deg,#fceba8,#ddb04a_46%,#a0761f)] text-[#2b1d02] shadow-[0_18px_40px_-14px_rgb(245_183_0/.7)]">
            <span className="font-display text-4xl font-black tabular-nums">{top.avg.toFixed(1)}</span>
            <span className="-mt-3 text-xs font-bold">{top.number ?? ''}</span>
          </div>
          <p className="font-display text-2xl font-black">{top.name}</p>
          <p className="text-xs text-muted">{top.count} מדרגים</p>
        </div>
      ) : (
        <p className="sh-card text-sm text-muted">{canRate ? 'עוד אין דירוגים. תהיה הראשון.' : 'הדירוג נפתח אחרי שריקת הסיום.'}</p>
      )}

      {ranking.length > 1 && (
        <ol className="space-y-1.5">
          {ranking.map((r, i) => (
            <li key={r.playerId} className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface px-3 py-2">
              <span className="w-5 text-center font-display font-black text-muted tabular-nums">{i + 1}</span>
              <span className="flex-1 truncate">
                <b>{r.name}</b>
                {r.mine !== null && <small className="ms-2 text-xs text-accent-text">שלך: {r.mine}</small>}
              </span>
              <span className="text-xs text-dim tabular-nums">{r.count}</span>
              <b className="w-9 text-end font-display tabular-nums">{r.avg.toFixed(1)}</b>
            </li>
          ))}
        </ol>
      )}

      {canRate && !open && (
        <button type="button" onClick={() => setOpen(true)} className="w-full rounded-2xl bg-accent py-3 font-extrabold text-white">
          {rated ? '✏️ עדכון הדירוגים שלך' : '⭐ דרג את השחקנים (1–10)'}
        </button>
      )}

      {canRate && open && (
        <div className="space-y-2 rounded-2xl border border-line bg-surface-2 p-3">
          <p className="text-sm text-muted">תן ציון 1–10 למי ששיחק. מספיק לדרג חלק.</p>
          <ul className="space-y-2">
            {squad.map((p) => (
              <li key={p.playerId} className="space-y-1">
                <span className="text-sm">
                  <b>{p.name}</b> <small className="text-dim">{p.number}</small>
                </span>
                <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label={`ציון ל${p.short}`}>
                  {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={scores[p.playerId] === n}
                      onClick={() => setScores((s) => ({ ...s, [p.playerId]: n }))}
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg border font-display text-sm font-bold tabular-nums',
                        scores[p.playerId] === n ? 'border-accent bg-accent text-white' : 'border-line text-muted',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending || Object.keys(scores).length === 0}
            onClick={() =>
              start(async () => {
                const ratings = Object.entries(scores).map(([playerId, score]) => ({ playerId, score }))
                const r = await rateMatchAction({ fixtureId, ratings })
                if (r.data && 'ok' in r.data) {
                  setOpen(false)
                  setMsg('הדירוגים נשמרו ✓')
                  router.refresh()
                } else setMsg((r.data && 'error' in r.data && r.data.error) || 'הדירוג לא נשמר')
              })
            }
            className="w-full rounded-xl bg-accent py-3 font-bold text-white disabled:opacity-40"
          >
            {pending ? 'שומר…' : `שליחת הדירוגים (${Object.keys(scores).length})`}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-center text-sm text-muted">
          {msg}
        </p>
      )}
    </section>
  )
}
