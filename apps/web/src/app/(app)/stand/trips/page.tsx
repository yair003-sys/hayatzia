import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BackToStand } from '@/features/team-life/components/back'
import { TripsBoard, type MatchOption } from '@/features/team-life/components/boards'
import { getTrips } from '@/features/team-life/server/queries'
import { displayTeam } from '@/features/matches/api-teams'
import { getLeague } from '@/features/matches/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'נוסעים למשחק' }

export default function Page() {
  return (
    <section className="space-y-4">
      <BackToStand />
      <h1 className="font-display text-3xl font-black">נוסעים למשחק</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Trips />
      </Suspense>
    </section>
  )
}

async function Trips() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const league = await getLeague()
  const now = Date.now() / 1000
  const matches: MatchOption[] = (league?.fixtures ?? [])
    .filter((f) => f.t > now - 3 * 3600)
    .map((f) => ({ f, home: displayTeam(f.h, league?.teams[String(f.h)]?.name), away: displayTeam(f.a, league?.teams[String(f.a)]?.name) }))
    .filter(({ home, away }) => home.id === s.team.id || away.id === s.team.id)
    .slice(0, 6)
    .map(({ f, home, away }) => ({
      id: f.id,
      kickoff: f.t,
      label: `${home.id === s.team.id ? `נגד ${away.short} (בית)` : `נגד ${home.short} (חוץ)`} · ${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' }).format(new Date(f.t * 1000))}`,
    }))
  const trips = await getTrips(matches.map((m) => m.id))
  return <TripsBoard matches={matches} trips={trips} meId={s.userId} />
}
