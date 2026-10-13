'use client'

import type { CSSProperties } from 'react'
import { isTicketLive, minuteLabel } from '@/features/stand-home/schema'
import type { DisplayTeam } from '../api-teams'
import { sideScore } from '../live'
import { DONE_STATUSES, type Fixture } from '../schema'
import { Crest } from './crest'
import { useNow } from './use-now'

const STATUS_HE: Record<string, string> = { PST: 'נדחה', CANC: 'בוטל', ABD: 'הופסק', TBD: 'מועד לא סופי' }

/**
 * Top of the match page in both clubs' colours: crest discs, score with LIVE and minute, or the kick-off time.
 * `day`/`time` come formatted from the server, so the client's ICU can never change the hydrated text.
 */
export function MatchHero(props: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam; round: string; day: string; time: string }) {
  const { fixture: f, home, away, round, day, time } = props
  const now = useNow()
  const minute = now !== null && isTicketLive(f, now) ? minuteLabel(f, now) : ''
  const live = minute !== '' && minute !== 'הסתיים'
  const done = DONE_STATUSES.has(f.st) || minute === 'הסתיים'
  const hasScore = f.gh !== null || f.ga !== null
  const style = { '--h': home.bar, '--w': away.bar } as CSSProperties
  return (
    <header className="lc-hero" style={style}>
      <h1 className="sr-only">
        {home.name} נגד {away.name}
      </h1>
      {f.dm && <p className="lc-hero-demo">משחק לדוגמה · נתונים לדוגמה</p>}
      <p className="lc-hero-top">
        {round} · {day} {time}
      </p>
      <div className="lc-row3">
        <div className="lc-team">
          <Crest team={home} size="lg" />
          <b>{home.name}</b>
        </div>
        <div className="lc-mid">
          {live ? (
            <>
              <span className="lc-tag">LIVE</span>
              <span className="lc-min">{minute}</span>
            </>
          ) : (
            <span className="lc-min">{done ? 'הסתיים' : (STATUS_HE[f.st] ?? day)}</span>
          )}
          <span className="lc-score">{hasScore || live ? sideScore(f) : time}</span>
        </div>
        <div className="lc-team">
          <Crest team={away} size="lg" />
          <b>{away.name}</b>
        </div>
      </div>
      {f.v && <p className="lc-hero-v">{f.v}</p>}
    </header>
  )
}
