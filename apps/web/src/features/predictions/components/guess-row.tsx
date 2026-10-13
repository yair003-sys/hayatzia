'use client'

import type { CSSProperties } from 'react'
import { useState, useTransition } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { DisplayTeam } from '@/features/matches/api-teams'
import { cn } from '@/lib/utils'
import type { MyGuess } from '../schema'
import { saveGuessAction } from '../server/actions'

type Props = {
  fixtureId: number
  home: DisplayTeam
  away: DisplayTeam
  when: string
  locked: boolean
  result: { home: number; away: number } | null
  initial: MyGuess | null
  demo?: boolean
}

/** One match: −/+ for each side, save; locked at kick-off; after full time the real score and my points. */
export function GuessRow({ fixtureId, home, away, when, locked, result, initial, demo }: Props) {
  const [h, setH] = useState(initial?.home ?? 0)
  const [a, setA] = useState(initial?.away ?? 0)
  const [saved, setSaved] = useState<{ home: number; away: number } | null>(initial ? { home: initial.home, away: initial.away } : null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = !saved || saved.home !== h || saved.away !== a

  const side = (t: DisplayTeam, v: number, set: (n: number) => void) => (
    <div className="flex items-center gap-2">
      <span className="sh-scarf" style={{ '--a': t.bg, '--b': t.ring, '--h': '22px', width: 7 } as CSSProperties} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-display font-bold">{t.short}</span>
      {locked ? (
        <span className="w-8 text-center text-xl t-num">{saved ? (t === home ? saved.home : saved.away) : '–'}</span>
      ) : (
        <span className="flex items-center gap-1.5">
          <button type="button" aria-label={`פחות שערים ל${t.short}`} disabled={v === 0} onClick={() => set(v - 1)} className="grid size-9 place-items-center rounded-full border border-line disabled:opacity-30">
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="w-7 text-center text-xl t-num" aria-live="polite">
            {v}
          </span>
          <button type="button" aria-label={`עוד שער ל${t.short}`} disabled={v === 20} onClick={() => set(v + 1)} className="grid size-9 place-items-center rounded-full border border-line disabled:opacity-30">
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  )

  return (
    <article className="sh-card gap-2.5" aria-label={`${home.short} נגד ${away.short}`}>
      <header className="flex items-center gap-2 text-xs text-muted">
        <span>{when}</span>
        {demo && <span className="sh-tag">משחק לדוגמה</span>}
        {initial?.points != null && (
          <span className={cn('ms-auto rounded-full px-2.5 py-0.5 font-bold', initial.points === 3 ? 'bg-ok/15 text-ok' : initial.points === 1 ? 'bg-warn/15 text-warn' : 'bg-white/5 text-muted')}>
            +{initial.points} נק׳
          </span>
        )}
      </header>
      {side(home, h, setH)}
      {side(away, a, setA)}
      {result && (
        <p className="text-xs text-muted">
          תוצאה: <b className="text-fg tabular-nums" dir="ltr">{result.home} – {result.away}</b>
          {saved ? '' : ' · לא ניחשת'}
        </p>
      )}
      {!locked && (
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const r = await saveGuessAction({ fixtureId, home: h, away: a })
              if (r.data && 'ok' in r.data) {
                setSaved({ home: h, away: a })
                setMsg('נשמר ✓')
              } else setMsg((r.data && 'error' in r.data && r.data.error) || r.serverError || 'הניחוש לא נשמר')
            })
          }
          className="rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {pending ? 'שומר…' : saved ? (dirty ? 'עדכון הניחוש' : 'הניחוש נשמר') : 'שמירת הניחוש'}
        </button>
      )}
      {locked && !result && <p className="text-xs text-muted">הניחושים נסגרו</p>}
      {msg && (
        <p role="status" className="text-xs text-muted">
          {msg}
        </p>
      )}
    </article>
  )
}
