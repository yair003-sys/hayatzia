import Link from 'next/link'
import { displayTeam } from '../api-teams'
import { kickoffDay, kickoffTime } from '../format'
import { DONE_STATUSES, LIVE_STATUSES, type Fixture, type League } from '../schema'
import { TeamBadge } from './team-badge'

export function FixtureRow({ fixture: f, teams }: { fixture: Fixture; teams: League['teams'] }) {
  const home = displayTeam(f.h, teams[String(f.h)]?.name)
  const away = displayTeam(f.a, teams[String(f.a)]?.name)
  const live = LIVE_STATUSES.has(f.st)
  const done = DONE_STATUSES.has(f.st)
  return (
    <Link
      href={`/matches/${f.id}`}
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md bg-surface px-3 py-3 transition-colors hover:bg-surface-2"
    >
      <TeamBadge team={home} />
      <span className="min-w-16 text-center">
        {done || live ? (
          <span className="text-lg t-num" dir="ltr">
            {f.gh ?? 0} : {f.ga ?? 0}
          </span>
        ) : (
          <span className="text-sm font-bold tabular-nums">{kickoffTime(f.t)}</span>
        )}
        <span className={live ? 'block text-[11px] font-bold text-live' : 'block text-[11px] text-dim'}>
          {live ? `חי · ${f.el ?? ''}′` : kickoffDay(f.t)}
        </span>
        {f.dm && <span className="block text-[10px] font-bold text-warn">משחק לדוגמה</span>}
      </span>
      <TeamBadge team={away} align="end" />
    </Link>
  )
}
