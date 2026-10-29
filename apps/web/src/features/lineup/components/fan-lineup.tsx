'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { emptyXI, type FansXI, type LineupPhase, type SaveLineupInput, type SavedLineup, type SquadPlayer } from '../schema'
import { saveFanLineupAction } from '../server/actions'
import { LineupBoard, type BoardCell } from './lineup-board'
import { LineupBuilder } from './lineup-builder'

type Props = {
  fixtureId: number
  team: { name: string; short: string; bg: string; ring: string; bar: string }
  phase: LineupPhase
  squad: SquadPlayer[]
  mine: SavedLineup | null
  fans: FansXI | null
  ratings: Record<string, number> | null
  /** Injected in tests; the server action otherwise. */
  save?: (input: SaveLineupInput) => Promise<{ ok: true } | { error: string }>
}
type View = 'mine' | 'fans'

/**
 * The fans' lineup on the match page's "הרכב" tab, for the fan's own club: "ההרכב שלי / ההרכב של האוהדים" on the
 * pitch, percent per slot, how many fans chose, and the builder until kick-off. Locked after it; after the final
 * whistle each player carries the fans' match rating.
 */
export function FanLineup({ fixtureId, team, phase, squad, mine: savedMine, fans, ratings, save: saveProp }: Props) {
  const tl = useTranslations('lineup')
  const lockLabel: Record<Exclude<LineupPhase, 'open'>, string> = {
    locked: tl('lockLocked'),
    done: tl('lockDone'),
    off: tl('lockOff'),
    unscheduled: tl('lockUnscheduled'),
  }
  const save =
    saveProp ??
    (async (input: SaveLineupInput): Promise<{ ok: true } | { error: string }> => {
      const r = await saveFanLineupAction(input)
      return r.data ?? { error: r.serverError ?? tl('saveFailed') }
    })
  const fansLine = (n: number) => (n === 1 ? tl('oneFanChose') : tl('fansChose', { count: n.toLocaleString('he-IL') }))
  const router = useRouter()
  const [mine, setMine] = useState(savedMine)
  const [view, setView] = useState<View>(fans ? 'fans' : 'mine')
  const [open, setOpen] = useState(false)
  const saved = useRef(false)
  const close = useCallback(() => {
    setOpen(false)
    // Fresh counts once the overlay's history entry is gone (refreshing during the back navigation would race it).
    if (saved.current) {
      saved.current = false
      router.refresh()
    }
  }, [router])

  if (phase !== 'open' && !mine && !fans) return null

  const byId = new Map(squad.map((p) => [p.id, p]))
  const rating = (id: string) => {
    const r = ratings?.[id]
    return r === undefined ? {} : { rating: r }
  }
  const cell = (id: string | null | undefined, pct?: number): BoardCell => {
    const p = id ? byId.get(id) : undefined
    if (!p) return null
    return { number: p.number, name: p.short, ...(pct === undefined ? {} : { pct }), ...rating(p.id) }
  }
  const board =
    view === 'fans'
      ? fans && { formation: fans.formation, cells: fans.slots.map((s) => cell(s?.playerId, s?.pct)), label: tl('fansLineupOf', { team: team.name }) }
      : mine && { formation: mine.formation, cells: mine.xi.map((id) => cell(id)), label: tl('myLineupFor', { team: team.name }) }
  const rated = !!ratings && Object.keys(ratings).length > 0

  return (
    <section className="lu space-y-3" aria-labelledby="lu-sec">
      <div className="lc-sec">
        <h2 id="lu-sec" className="lu-sec-h">
          {tl('fansLineup')}
        </h2>
        {phase !== 'open' && (
          <small className="lu-locked">
            <Lock className="size-3" aria-hidden="true" />
            {lockLabel[phase]}
          </small>
        )}
      </div>

      <div className="lc-switch" role="group" aria-label={tl('whichLineup')}>
        <button type="button" aria-pressed={view === 'mine'} onClick={() => setView('mine')}>
          <span>{tl('myLineup')}</span>
        </button>
        <button type="button" aria-pressed={view === 'fans'} onClick={() => setView('fans')}>
          <span>{tl('fansLineup')}</span>
        </button>
      </div>

      <p className="lc-formation">
        {view === 'fans' ? (
          fans ? (
            <>
              <span>{fansLine(fans.fans)}</span>
              <span>
                {tl('formationWord')} <bdi className="t-num">{fans.formation}</bdi> · <bdi className="t-num">{fans.formationPct}%</bdi>
              </span>
            </>
          ) : (
            <span>{tl('noFansLineup')}{phase === 'open' ? tl('beFirstSuffix') : ''}</span>
          )
        ) : mine ? (
          <span>
            {tl('formationWord')} <bdi className="t-num">{mine.formation}</bdi>
          </span>
        ) : (
          <span>{phase === 'open' ? tl('notBuiltOpen') : tl('notBuilt')}</span>
        )}
      </p>

      {board ? (
        <LineupBoard formation={board.formation} cells={board.cells} colours={team} label={board.label} />
      ) : (
        phase === 'open' && <LineupBoard formation="4-3-3" cells={emptyXI().map(() => null)} colours={team} label={tl('emptyPitch')} />
      )}

      {rated && <p className="lu-note">{tl('ratingNote')}</p>}

      {phase === 'open' && (
        <button type="button" className="lu-cta" onClick={() => setOpen(true)}>
          {mine ? tl('editMyLineup') : tl('buildYourLineup')}
        </button>
      )}

      {open && (
        <LineupBuilder
          fixtureId={fixtureId}
          team={team}
          squad={squad}
          initial={mine ?? { formation: '4-3-3', xi: emptyXI() }}
          onSave={save}
          onSaved={(next) => {
            saved.current = true
            setMine(next)
            setView('mine')
          }}
          onClose={close}
        />
      )}
    </section>
  )
}
