'use client'

import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import type { DisplayTeam } from '../api-teams'
import { matchPhase, sideScore } from '../live'
import type { Fixture } from '../schema'
import { Crest } from './crest'
import { useNow } from './use-now'

/**
 * Top of the match page in both clubs' colours: crest discs, score with LIVE and minute, or the kick-off time.
 * `day`/`time` come formatted from the server, so the client's ICU can never change the hydrated text.
 */
export function MatchHero(props: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam; round: string; day: string; time: string }) {
  const { fixture: f, home, away, round, day, time } = props
  const t = useTranslations('matches')
  const statusHe: Record<string, string> = { PST: t('stPST'), CANC: t('stCANC'), ABD: t('stABD'), TBD: t('stTBD') }
  const now = useNow()
  // Same rule as the Matches tiles: a stale 1H/2H after the 170′ cut-off reads "הסתיים", not its status or the date.
  const { live, done, minute } = matchPhase(f, now)
  const hasScore = f.gh !== null || f.ga !== null
  const style = { '--h': home.bar, '--w': away.bar } as CSSProperties
  return (
    <header className="lc-hero" style={style}>
      <h1 className="sr-only">
        {home.name} {t('versus')} {away.name}
      </h1>
      {f.dm && <p className="lc-hero-demo">{t('sampleMatchData')}</p>}
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
            <span className="lc-min">{done ? t('finished') : (statusHe[f.st] ?? day)}</span>
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
