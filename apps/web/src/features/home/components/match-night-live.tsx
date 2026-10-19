'use client'

import Link from 'next/link'
import type { DisplayTeam } from '@/features/matches/api-teams'
import { sideScore } from '@/features/matches/live'
import type { Fixture } from '@/features/matches/schema'
import { useNow } from '@/features/matches/components/use-now'
import { isTicketLive, minuteLabel } from '@/features/stand-home/schema'

/**
 * The top hero while the club is playing right now: the live score, the minute (self-updating), and a big "כנס לצ'אט
 * החי" that opens the match room. Replaces the "next match" hero during a live game, so the home leads with the match
 * being played instead of skipping ahead. If the game ends while the fan is watching, it stops claiming to be live.
 */
export function MatchNightLiveHero({
  fixture: f,
  home,
  away,
  homeMine,
  awayMine,
  fans,
}: {
  fixture: Fixture
  home: DisplayTeam
  away: DisplayTeam
  /** Highlight the home team as the viewer's club. Both false for a neutral viewer (another clubs' game). */
  homeMine: boolean
  awayMine: boolean
  fans: number | null
}) {
  const now = useNow()
  // Server list can come from a cached read; once the client clock is known, drop a game that has just ended.
  if (now !== null && !isTicketLive(f, now)) return null
  const minute = now === null ? '' : minuteLabel(f, now)
  const ended = minute === 'הסתיים'
  return (
    <section className="mnh mnh-live" aria-label={ended ? 'המשחק הסתיים' : 'משחק חי עכשיו'}>
      <span className="mnh-beam mnh-beam-1" aria-hidden="true" />
      <span className="mnh-beam mnh-beam-2" aria-hidden="true" />
      <span className="mnh-beam mnh-beam-3" aria-hidden="true" />
      <span className="mnh-mosaic" aria-hidden="true" />
      <p className="mnh-label">
        {!ended && <i className="mnh-dot mnh-dot-live" aria-hidden="true" />}
        {ended ? 'המשחק הסתיים' : 'משחק חי עכשיו'}
        {f.dm && <span className="sh-tag ms-2">משחק לדוגמה</span>}
      </p>
      <Link href={`/matches/${f.id}/live`} className="mnh-teams mnh-live-teams" aria-label={`${home.name} ${f.gh ?? 0}, ${away.name} ${f.ga ?? 0}`}>
        <span className="mnh-team" data-mine={homeMine}>
          {home.short}
          <small>בבית</small>
        </span>
        <span className="mnh-live-score" aria-hidden="true">
          {sideScore(f)}
        </span>
        <span className="mnh-team" data-mine={awayMine}>
          {away.short}
          <small>בחוץ</small>
        </span>
      </Link>
      <p className="mnh-live-min">{ended ? 'תוצאת סיום' : minute || ' '}</p>
      {fans !== null && fans > 0 && (
        <p className="mnh-fans">
          <i className="mnh-pulse" aria-hidden="true" />
          יחד איתך עכשיו <b>{fans.toLocaleString('he-IL')}</b> אוהדים
        </p>
      )}
      <Link href={`/matches/${f.id}/live`} className="mnh-cta mnh-cta-live">
        כנס לצ׳אט החי ←
      </Link>
    </section>
  )
}
