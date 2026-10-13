'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { isTicketLive, minuteLabel } from '@/features/stand-home/schema'
import { roundLabelHe, type DisplayTeam } from '../api-teams'
import { kickoffTime } from '../format'
import { sideScore } from '../live'
import { DONE_STATUSES, LIVE_STATUSES, type Fixture } from '../schema'
import { Crest } from './crest'
import { useNow } from './use-now'

/** Compact match on the Matches list: a coloured card while live, otherwise a row with kick-off time or final score. */
export function MatchTile({ fixture: f, home, away }: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam }) {
  const now = useNow()
  // Before the clock is known (prerender, hydration) the status decides; the 170′ rule corrects stale statuses after.
  const minute = now === null ? '' : minuteLabel(f, now)
  // A live game whose minute reads "הסתיים" is shown as a final score, never as "LIVE הסתיים".
  const live = (now === null ? LIVE_STATUSES.has(f.st) : isTicketLive(f, now)) && minute !== 'הסתיים'
  // A stale live status (no longer live by the clock) is a finished game too: show its score, not the kick-off time.
  const done = DONE_STATUSES.has(f.st) || (LIVE_STATUSES.has(f.st) && !live)

  if (live) {
    return (
      <Link href={`/matches/${f.id}`} className="lc-tile" style={{ '--h': home.bar, '--w': away.bar } as CSSProperties}>
        <div className="lc-team">
          <Crest team={home} size="sm" />
          <b>{home.short}</b>
        </div>
        <div className="lc-mid">
          <span className="lc-tag">LIVE {minute}</span>
          <span className="lc-score">{sideScore(f)}</span>
          {f.dm && <span className="lc-demo">משחק לדוגמה</span>}
        </div>
        <div className="lc-team">
          <Crest team={away} size="sm" />
          <b>{away.short}</b>
        </div>
      </Link>
    )
  }

  return (
    <Link href={`/matches/${f.id}`} className="lc-row">
      <Crest team={home} size="sm" />
      <span className="lc-row-t">
        {home.short} – {away.short}
        <small>
          {roundLabelHe(f.r)}
          {f.dm && <span className="lc-demo"> · משחק לדוגמה</span>}
        </small>
      </span>
      <span className="lc-row-k" data-done={done}>
        {done ? sideScore(f) : kickoffTime(f.t)}
      </span>
      <Crest team={away} size="sm" />
    </Link>
  )
}
