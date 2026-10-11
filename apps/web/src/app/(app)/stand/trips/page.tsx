import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BackToStand } from '@/features/team-life/components/back'
import { TripsBoard } from '@/features/team-life/components/boards'
import { upcomingTeamMatches } from '@/features/team-life/server/matches'
import { getTrips } from '@/features/team-life/server/queries'
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
  const matches = upcomingTeamMatches(league, s.team.id)
  const trips = await getTrips(matches.map((m) => m.id))
  return <TripsBoard matches={matches} trips={trips} meId={s.userId} />
}
