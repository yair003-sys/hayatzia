'use client'

import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { isTicketLive, minuteLabel } from '@/features/stand-home/schema'
import type { DisplayTeam } from '../api-teams'
import { sideScore } from '../live'
import type { Fixture } from '../schema'
import { Crest } from './crest'
import { useNow } from './use-now'

/** Big card for a league match live right now: both clubs' colours, LIVE pulse, minute, score; opens the match room. */
export function LiveCard({ fixture: f, home, away }: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam }) {
  const t = useTranslations('matches')
  const now = useNow()
  // The server list may come from a cached `liveNow`; once the client clock is known, drop a game that has ended.
  if (now !== null && !isTicketLive(f, now)) return null
  const minute = now === null ? '' : minuteLabel(f, now)
  const ended = minute === 'הסתיים' // never "LIVE הסתיים": show it as a final score
  const style = { '--h': home.bar, '--w': away.bar } as CSSProperties
  return (
    <Link
      href={`/matches/${f.id}?tab=room`}
      className="lc-live"
      style={style}
      aria-label={`${t('liveCardScore', { home: home.name, away: away.name, status: ended ? t('finished') : t('live'), gh: f.gh ?? 0, ga: f.ga ?? 0 })}. ${t('enterMatchRoom')}`}
    >
      <div className="lc-row3">
        <div className="lc-team">
          <Crest team={home} />
          <b>{home.short}</b>
        </div>
        <div className="lc-mid">
          {!ended && <span className="lc-tag">LIVE</span>}
          <span className="lc-min">{minute || '\u00a0'}</span>
          <span className="lc-score">{sideScore(f)}</span>
          {f.dm && <span className="lc-demo">{t('sampleMatch')}</span>}
        </div>
        <div className="lc-team">
          <Crest team={away} />
          <b>{away.short}</b>
        </div>
      </div>
      <div className="lc-foot">
        <span>{t('enterMatchRoom')}</span>
        <span aria-hidden="true">←</span>
      </div>
    </Link>
  )
}
