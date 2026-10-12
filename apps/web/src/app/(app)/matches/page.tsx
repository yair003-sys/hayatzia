import type { Metadata } from 'next'
import { Suspense } from 'react'
import { roundLabelHe } from '@/features/matches/api-teams'
import { FixtureRow } from '@/features/matches/components/fixture-row'
import { StandingsTable } from '@/features/matches/components/standings-table'
import { currentRoundIndex, groupByRound } from '@/features/matches/rounds'
import { getLeague } from '@/features/matches/server/queries'
import { PredictCard } from '@/features/predictions/components/predict-card'

export const metadata: Metadata = { title: 'משחקים' }

export default function MatchesPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-black">משחקים</h1>
      <Suspense fallback={<div className="skeleton h-20 rounded-2xl" aria-hidden="true" />}>
        <PredictCard />
      </Suspense>
      <Suspense fallback={<MatchesSkeleton />}>
        <MatchesContent />
      </Suspense>
    </section>
  )
}

async function MatchesContent() {
  const league = await getLeague()
  if (!league) {
    return <p className="rounded-md bg-surface p-4 text-muted">לא הצלחנו לטעון את המשחקים כרגע. נסה שוב בעוד רגע.</p>
  }
  const rounds = groupByRound(league.fixtures)
  const round = rounds[currentRoundIndex(rounds)]
  return (
    <>
      <p className="text-sm text-muted">
        עונת {league.league.season}/{String((league.league.season + 1) % 100).padStart(2, '0')}
      </p>
      {round && (
        <section aria-labelledby="round-title" className="space-y-2">
          <h2 id="round-title" className="text-lg font-bold">
            {roundLabelHe(round.key)}
          </h2>
          <div className="space-y-2">
            {round.fixtures.map((f) => (
              <FixtureRow key={f.id} fixture={f} teams={league.teams} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="table-title" className="space-y-2">
        <h2 id="table-title" className="text-lg font-bold">
          טבלה
        </h2>
        <StandingsTable league={league} />
      </section>
    </>
  )
}

function MatchesSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="skeleton h-14 rounded-md" />
      ))}
    </div>
  )
}
