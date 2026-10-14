import type { Metadata } from 'next'
import { Suspense } from 'react'
import { displayTeam } from '@/features/matches/api-teams'
import { DayStrip } from '@/features/matches/components/day-strip'
import { MatchTile } from '@/features/matches/components/match-tile'
import { StandingsTable } from '@/features/matches/components/standings-table'
import { dayStrip, fixturesOn, israelDayKey, pickDay } from '@/features/matches/live'
import { getLeague } from '@/features/matches/server/queries'
import { PredictCard } from '@/features/predictions/components/predict-card'

export const metadata: Metadata = { title: 'מרכז הליגה' }

export default function MatchesPage({ searchParams }: PageProps<'/matches'>) {
  return (
    <section className="space-y-6">
      <h1 className="t-page">מרכז הליגה</h1>
      <Suspense fallback={<DaySkeleton />}>{searchParams.then((sp) => <DayGames d={sp.d} />)}</Suspense>
      <Suspense fallback={<div className="skeleton h-20 rounded-2xl" aria-hidden="true" />}>
        <PredictCard />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <LeagueTable />
      </Suspense>
    </section>
  )
}

// Reading the clock is fine here: this runs only after searchParams resolved (request time, never in the prerender).
const clock = () => Date.now()

async function DayGames({ d }: { d: unknown }) {
  const league = await getLeague()
  if (!league) {
    return <p className="rounded-md bg-surface p-4 text-muted">לא הצלחנו לטעון את המשחקים כרגע. נסה שוב בעוד רגע.</p>
  }
  const todayKey = israelDayKey(Math.floor(clock() / 1000))
  const { centre, selected } = pickDay(todayKey, league.fixtures, d)
  const days = dayStrip(centre, league.fixtures)
  const games = fixturesOn(selected, league.fixtures)
  const day = days.find((x) => x.key === selected)
  const title =
    selected === todayKey ? 'היום' : `יום ${day?.weekday ?? ''} ${Number(selected.slice(8))}.${Number(selected.slice(5, 7))}`
  const team = (apiId: number) => displayTeam(apiId, league.teams[String(apiId)]?.name)

  return (
    <div className="space-y-4">
      <DayStrip days={days} selected={selected} todayKey={todayKey} />
      <section aria-labelledby="day-title" className="space-y-2.5">
        <div className="lc-sec">
          <h2 id="day-title" className="t-sec">
            {title}
          </h2>
          {games.length > 0 && <small>{games.length === 1 ? 'משחק אחד' : `${games.length} משחקים`}</small>}
        </div>
        {games.length > 0 ? (
          games.map((f) => <MatchTile key={f.id} fixture={f} home={team(f.h)} away={team(f.a)} />)
        ) : (
          <p className="lc-end">אין משחקים ביום הזה</p>
        )}
      </section>
    </div>
  )
}

async function LeagueTable() {
  const league = await getLeague()
  if (!league) return null
  const season = league.league.season
  return (
    <section aria-labelledby="table-title" className="space-y-2">
      <div className="lc-sec">
        <h2 id="table-title" className="t-sec">
          טבלה
        </h2>
        <small>
          עונת {season}/{String((season + 1) % 100).padStart(2, '0')}
        </small>
      </div>
      <StandingsTable league={league} />
    </section>
  )
}

function DaySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-16 rounded-full" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="skeleton h-10 rounded-md" />
      ))}
    </div>
  )
}
