import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BackToStand } from '@/features/team-life/components/back'
import { TripsBoard } from '@/features/team-life/components/boards'
import { upcomingTeamMatches } from '@/features/team-life/server/matches'
import { getTrips } from '@/features/team-life/server/queries'
import { getLeague } from '@/features/matches/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'נוסעים למשחק' }

export default function Page({ searchParams }: PageProps<'/stand/trips'>) {
  return (
    <section className="space-y-4">
      <BackToStand />
      <h1 className="t-page">נוסעים למשחק</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        {searchParams.then((sp) => (
          <Trips focus={typeof sp.trip === 'string' ? sp.trip : undefined} />
        ))}
      </Suspense>
    </section>
  )
}

/** `focus`: a trip opened from the activity bell, a push or a banner (/stand/trips?trip=<id>). */
async function Trips({ focus }: { focus?: string }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const league = await getLeague()
  const matches = upcomingTeamMatches(league, s.team.id)
  const trips = await getTrips(matches.map((m) => m.id))
  return <TripsBoard key={focus ?? ''} matches={matches} trips={trips} meId={s.userId} focusId={focus} />
}
