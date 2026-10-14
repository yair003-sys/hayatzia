import type { CSSProperties } from 'react'
import type { DisplayTeam } from '../api-teams'
import { initials } from '../live'

type CrestTeam = Pick<DisplayTeam, 'short' | 'bg' | 'ring'>

/** A club drawn as a colour disc with its initials (we never use real crests). */
export function Crest({ team, size = 'md' }: { team: CrestTeam; size?: 'sm' | 'md' | 'lg' }) {
  const style = { '--a': team.bg, '--b': team.ring, '--t': team.ring } as CSSProperties
  return (
    <span className="lc-crest" data-size={size} style={style} aria-hidden="true">
      <span>{initials(team.short)}</span>
    </span>
  )
}
