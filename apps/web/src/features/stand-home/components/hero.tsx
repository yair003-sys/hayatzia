'use client'

import type { CSSProperties } from 'react'
import { Lock } from 'lucide-react'
import type { Team } from '@/features/teams/data'
import { useOnlineCount } from './presence'

/** Legacy hero: scarf, "האוהדים של", club name, verified fans (trigger counter) and fans online now (presence). */
export function Hero({ team, fans }: { team: Team; fans: number | null }) {
  const online = useOnlineCount()
  const colours = { '--a': team.bg, '--b': team.ring } as CSSProperties
  return (
    <section className="sh-hero" style={colours} aria-label={`האוהדים של ${team.name}`}>
      <span className="glow" aria-hidden="true" />
      <span className="glow2" aria-hidden="true" />
      <svg className="art" viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r="70" />
        <line x1="0" y1="110" x2="220" y2="110" />
      </svg>
      <div className="flex items-center gap-3.5">
        <span className="sh-scarf" style={{ '--h': '58px', width: 12 } as CSSProperties} aria-hidden="true" />
        <div>
          <p className="kk">האוהדים של</p>
          <h1 className="tmn">{team.name}</h1>
        </div>
      </div>
      <div className="sh-stats">
        <div>
          <b>{fans === null ? '—' : fans.toLocaleString('he-IL')}</b>
          אוהדים מאומתים
        </div>
        <div aria-live="polite">
          <b>{online === null ? '—' : online.toLocaleString('he-IL')}</b>
          מחוברים עכשיו
        </div>
      </div>
      <p className="sh-lock">
        <Lock className="size-4" aria-hidden="true" />
        סגור לאוהדי {team.short} בלבד
      </p>
    </section>
  )
}
