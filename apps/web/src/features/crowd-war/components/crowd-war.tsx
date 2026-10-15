import type { CSSProperties } from 'react'
import { connection } from 'next/server'
import { Shield } from 'lucide-react'
import type { DisplayTeam } from '@/features/matches/api-teams'
import type { Fixture } from '@/features/matches/schema'
import { getSessionProfile } from '@/features/profile/server/queries'
import {
  HOW_TO_EARN,
  WAR_WINDOW_HOURS,
  contributedLine,
  resultLine,
  warColours,
  warOutcome,
  warPhase,
  warSplit,
} from '../schema'
import { getWarScore, type WarScore } from '../server/queries'

// Crowd war ("מלחמת הקהלים"): a tug-of-war bar in the two clubs' colours. Server Components only (no motion beyond a
// CSS width transition, off under reduced motion). Home side first: on the right in RTL, as in the match row.

type Side = Pick<DisplayTeam, 'id' | 'short' | 'bar' | 'ring'>
type Props = { fixture: Fixture; home: Side; away: Side }

const clock = () => Date.now()

/** On the home's next-match card: the closed note before the window, the live bar while open, the result after. */
export async function HomeCrowdWar({ fixture, home, away }: Props) {
  await connection()
  const phase = warPhase(fixture.t, clock())
  if (phase === 'soon') {
    return (
      <div className="cw" role="group" aria-label="מלחמת הקהלים">
        <p className="cw-head">
          <span className="cw-title">מלחמת הקהלים</span>
          {fixture.dm && <span className="sh-tag">לדוגמה</span>}
        </p>
        <p className="cw-note">מלחמת הקהלים נפתחת {WAR_WINDOW_HOURS} שעות לפני המשחק</p>
        <p className="cw-earn">{HOW_TO_EARN}</p>
      </div>
    )
  }
  const score = await getWarScore(fixture.id, home.id, away.id)
  return <WarBar phase={phase} home={home} away={away} score={score} demo={fixture.dm === true} />
}

/** At the top of the match page, for fans of the two clubs: the live bar while open, the frozen result after. */
export async function MatchCrowdWar({ fixture, home, away }: Props) {
  const s = await getSessionProfile()
  if (s.status !== 'ready' || (s.team.id !== home.id && s.team.id !== away.id)) return null
  await connection()
  const phase = warPhase(fixture.t, clock())
  if (phase === 'soon') return null
  const score = await getWarScore(fixture.id, home.id, away.id)
  if (phase === 'final' && warOutcome(score.home, score.away) === 'none') return null
  return <WarBar phase={phase} home={home} away={away} score={score} demo={fixture.dm === true} />
}

export function WarBar(props: { phase: 'open' | 'final'; home: Side; away: Side; score: WarScore; demo?: boolean }) {
  const { phase, home, away, score, demo = false } = props
  const split = warSplit(score.home, score.away)
  const colours = warColours(home, away)
  const outcome = warOutcome(score.home, score.away)
  const total = score.home + score.away
  const style = { '--cw-h': colours.home, '--cw-a': colours.away, '--cw-p': `${split.home}%` } as CSSProperties
  const winner = outcome === 'home' ? home : outcome === 'away' ? away : null
  const result = phase === 'final' ? resultLine(home.short, away.short, score.home, score.away) : null

  return (
    <div className="cw" style={style} data-phase={phase} role="group" aria-label="מלחמת הקהלים">
      <p className="cw-head">
        <span className="cw-title">מלחמת הקהלים</span>
        {demo && <span className="sh-tag">לדוגמה</span>}
        <span className="cw-total">
          <b className="t-num">{total.toLocaleString('he-IL')}</b> נקודות
        </span>
      </p>
      {result && (
        <p className="cw-result" data-draw={outcome === 'draw'}>
          {winner && (
            <Shield
              className="cw-shield"
              style={{ color: winner === home ? colours.home : colours.away }}
              aria-hidden="true"
            />
          )}
          {result}
        </p>
      )}
      <div className="cw-sides">
        <span>
          {home.short} <b className="t-num">{split.home}%</b>
        </span>
        <span>
          {away.short} <b className="t-num">{split.away}%</b>
        </span>
      </div>
      <div
        className="cw-bar"
        role="img"
        aria-label={`${home.short} ${split.home} אחוז (${score.home} נקודות), ${away.short} ${split.away} אחוז (${score.away} נקודות)`}
      >
        <i className="cw-bar-h" />
        <i className="cw-bar-a" />
      </div>
      {phase === 'open' && (
        <>
          <p className="cw-foot">
            <span>מסתיים בשריקת הפתיחה</span>
            <span className="cw-mine">{contributedLine(score.mine)}</span>
          </p>
          <p className="cw-earn">{HOW_TO_EARN}</p>
        </>
      )}
      {phase === 'final' && score.mine > 0 && <p className="cw-foot">{contributedLine(score.mine)}</p>}
    </div>
  )
}
