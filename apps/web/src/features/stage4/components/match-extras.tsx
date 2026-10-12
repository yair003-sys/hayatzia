import type { DisplayTeam } from '@/features/matches/api-teams'
import { DONE_STATUSES, type Fixture } from '@/features/matches/schema'
import { roomState } from '@/features/match-room/schema'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getCheckedIn, getMotm } from '../server/queries'
import { CheckinButton } from './checkin-button'
import { MotmPanel } from './motm-panel'

const clock = () => Date.now()

/** On the match page, for fans of the two clubs: "הייתי שם" around the match, player of the match after it. */
export async function MatchExtras({ fixture: f, home, away }: { fixture: Fixture; home: DisplayTeam; away: DisplayTeam }) {
  const s = await getSessionProfile()
  if (s.status !== 'ready' || (s.team.id !== home.id && s.team.id !== away.id)) return null
  const room = roomState(f.t, clock())
  const active = room === 'open' || room === 'closing'
  const finished = DONE_STATUSES.has(f.st)
  const [checked, motm] = await Promise.all([active ? getCheckedIn(f.id) : Promise.resolve(false), finished ? getMotm(f.id, s.team.id) : Promise.resolve(null)])
  if (!active && !motm) return null
  return (
    <div className="space-y-4">
      {active && <CheckinButton fixtureId={f.id} done={checked} label={s.team.short} />}
      {motm && (
        <MotmPanel fixtureId={f.id} canRate={finished && active} squad={motm.squad} ranking={motm.ranking} mine={motm.mine} teamShort={s.team.short} />
      )}
    </div>
  )
}
