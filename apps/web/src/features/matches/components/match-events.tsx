import type { CSSProperties } from 'react'
import { ArrowLeftRight, CircleX, Tv } from 'lucide-react'
import type { DisplayTeam } from '../api-teams'
import { timeline, type EventKind, type FixtureEvent } from '../events'

type Side = { apiId: number; team: Pick<DisplayTeam, 'short' | 'bar'> }

function EventIcon({ kind }: { kind: EventKind }) {
  switch (kind) {
    case 'sub':
      return <ArrowLeftRight size={14} strokeWidth={2.2} />
    case 'var':
      return <Tv size={14} strokeWidth={2.2} />
    case 'missed-penalty':
      return <CircleX size={14} strokeWidth={2.2} />
    case 'yellow':
    case 'red':
      return <i className="lc-ev-card" data-kind={kind} />
    case 'goal':
    case 'own-goal':
    case 'penalty':
      return <i className="lc-ev-ball" data-kind={kind} />
    default:
      return <i className="lc-ev-dot" />
  }
}

/** The "משחק" tab: goals, cards, substitutions and VAR calls, newest first, each on its club's colour. */
export function MatchEvents({ events, home, away, empty }: { events: FixtureEvent[]; home: Side; away: Side; empty: string }) {
  const rows = timeline(events)
  if (rows.length === 0) return <p className="lc-end">{empty}</p>
  return (
    <ol className="lc-evs" aria-label="אירועי המשחק">
      {rows.map((r) => {
        const side = r.team === home.apiId ? home : r.team === away.apiId ? away : null
        const style = side ? ({ '--c': side.team.bar } as CSSProperties) : undefined
        return (
          <li key={r.key} className="lc-ev" style={style} data-kind={r.kind}>
            <b className="lc-ev-m">{r.minute}</b>
            <span className="lc-ev-ico" aria-hidden="true">
              <EventIcon kind={r.kind} />
            </span>
            <span className="lc-ev-t">
              <span>
                <strong>{r.label}</strong>
                {r.player && <> · <bdi>{r.player}</bdi></>}
              </span>
              {(r.extra || side) && <small>{[r.extra, side?.team.short].filter(Boolean).join(' · ')}</small>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
