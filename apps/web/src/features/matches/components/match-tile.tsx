'use client'

import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { roundLabelHe, type DisplayTeam } from '../api-teams'
import { kickoffTime } from '../format'
import { matchPhase, sideScore } from '../live'
import type { Fixture } from '../schema'
import { Crest } from './crest'
import { useNow } from './use-now'

/** Compact match on the Matches list: a coloured card while live, otherwise a row with kick-off time or final score. */
export function MatchTile({ fixture: f, home, away }: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam }) {
  const t = useTranslations('matches')
  const now = useNow()
  const { live, done, minute } = matchPhase(f, now)

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
          {f.dm && <span className="lc-demo">{t('sampleMatch')}</span>}
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
          {f.dm && <span className="lc-demo"> · {t('sampleMatch')}</span>}
        </small>
      </span>
      <span className="lc-row-k" data-done={done}>
        {done ? sideScore(f) : kickoffTime(f.t)}
      </span>
      <Crest team={away} size="sm" />
    </Link>
  )
}
