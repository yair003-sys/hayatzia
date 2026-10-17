import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BackToStand } from '@/features/team-life/components/back'
import { TripsBoard } from '@/features/team-life/components/boards'
import { upcomingTeamMatches } from '@/features/team-life/server/matches'
import { getMyRideProfile, getRidesToRate, getTrips } from '@/features/team-life/server/queries'
import { getLeague } from '@/features/matches/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getMyVerification } from '@/features/verification/server/queries'
import { LoadError } from '@/components/load-error'

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
  // The fan's own ride state does not need the league: it is read alongside it, only the trips wait for the matches.
  const matchesP = getLeague().then((league) => upcomingTeamMatches(league, s.team.id))
  const [matches, trips, ride, toRate, verification] = await Promise.all([
    matchesP,
    matchesP.then((ms) => getTrips(ms.map((m) => m.id), s.userId)),
    getMyRideProfile(),
    getRidesToRate(),
    getMyVerification(),
  ])
  if (!trips) return <LoadError />
  const verify = verification
    ? {
        required: verification.required,
        identity: verification.identity.status === 'approved',
        driver: verification.identity.status === 'approved' && verification.licence.status === 'approved' && !!verification.car,
      }
    : null
  return (
    <TripsBoard key={focus ?? ''} matches={matches} trips={trips} meId={s.userId} focusId={focus} ride={ride} toRate={toRate} verify={verify} />
  )
}
