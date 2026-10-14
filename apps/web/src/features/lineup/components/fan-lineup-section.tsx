import type { DisplayTeam } from '@/features/matches/api-teams'
import { DONE_STATUSES, type Fixture } from '@/features/matches/schema'
import { getSessionProfile } from '@/features/profile/server/queries'
import { lineupPhase } from '../schema'
import { getFanLineup } from '../server/queries'
import { FanLineup } from './fan-lineup'

const clock = () => Date.now()

/** On the match page's "הרכב" tab, for a fan of one of the two clubs: their club's fan lineup. Reads the session. */
export async function FanLineupSection({ fixture: f, home, away }: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam }) {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const side = s.team.id === home.id ? home : s.team.id === away.id ? away : null
  if (!side) return null
  const phase = lineupPhase(f, clock())
  const data = await getFanLineup(f.id, s.team.id, DONE_STATUSES.has(f.st))
  if (data.squad.length === 0) return null
  return (
    <FanLineup
      fixtureId={f.id}
      team={{ name: s.team.name, short: s.team.short, bg: s.team.bg, ring: s.team.ring }}
      phase={phase}
      squad={data.squad}
      mine={data.mine}
      fans={data.fans}
      ratings={data.ratings}
    />
  )
}
