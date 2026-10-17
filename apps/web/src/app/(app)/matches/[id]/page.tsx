import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { displayTeam, roundLabelHe } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { pickTab } from '@/features/matches/live'
import { DONE_STATUSES } from '@/features/matches/schema'
import { getFixtureDetail, getLeague } from '@/features/matches/server/queries'
import { LineupPitch } from '@/features/matches/components/lineup-pitch'
import { MatchEvents } from '@/features/matches/components/match-events'
import { MatchHero } from '@/features/matches/components/match-hero'
import { MatchTabs } from '@/features/matches/components/match-tabs'
import { MatchRoom } from '@/features/match-room/components/match-room'
import { roomState } from '@/features/match-room/schema'
import { getMatchMessages } from '@/features/match-room/server/queries'
import { getCrowd } from '@/features/crowd-verdict/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { LoadError } from '@/components/load-error'
import type { DisplayTeam } from '@/features/matches/api-teams'
import { MatchExtras } from '@/features/stage4/components/match-extras'
import { FanLineupSection } from '@/features/lineup/components/fan-lineup-section'
import { MatchCrowdWar } from '@/features/crowd-war/components/crowd-war'

const clock = () => Date.now()

export default function MatchPage({ params, searchParams }: PageProps<'/matches/[id]'>) {
  return (
    <section className="space-y-5">
      <Link href="/matches" className="text-sm text-accent-text">
        → כל המשחקים
      </Link>
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden="true" />}>
        {Promise.all([params, searchParams]).then(([{ id }, sp]) => (
          <MatchContent id={Number(id)} tab={sp.tab} />
        ))}
      </Suspense>
    </section>
  )
}

async function MatchContent({ id, tab: tabParam }: { id: number; tab: string | string[] | undefined }) {
  if (!Number.isInteger(id)) notFound()
  const league = await getLeague()
  const f = league?.fixtures.find((x) => x.id === id)
  if (!league || !f) notFound()
  const home = displayTeam(f.h, league.teams[String(f.h)]?.name)
  const away = displayTeam(f.a, league.teams[String(f.a)]?.name)
  const detail = league.have.includes(id) ? await getFixtureDetail(id) : null
  // The default tab depends on the room's clock (open → חדר), so this part is rendered per request.
  await connection()
  const tab = pickTab(tabParam, roomState(f.t, clock()))
  const notStarted = f.st === 'NS' || f.st === 'TBD'
  const noEvents = notStarted
    ? 'האירועים יופיעו כאן כשהמשחק יתחיל.'
    : !detail
      ? 'פרטי המשחק עוד לא נטענו.'
      : DONE_STATUSES.has(f.st)
        ? 'לא נרשמו אירועים במשחק הזה.'
        : 'עוד אין אירועים במשחק.'
  const lineupOf = (apiId: number) => detail?.lu.find((l) => l.team === apiId) ?? null
  return (
    <>
      <MatchHero fixture={f} home={home} away={away} round={roundLabelHe(f.r)} day={kickoffDay(f.t)} time={kickoffTime(f.t)} />
      {/* Fans of the two clubs only; nothing before the 48-hour window or when neither crowd scored. */}
      <Suspense fallback={null}>
        <MatchCrowdWar fixture={f} home={home} away={away} />
      </Suspense>
      <MatchTabs
        initial={tab}
        game={
          <MatchEvents
            events={detail?.ev ?? []}
            home={{ apiId: f.h, team: home }}
            away={{ apiId: f.a, team: away }}
            empty={noEvents}
          />
        }
        lineup={
          <div className="space-y-6">
            {/* Only fans of the two clubs get it, so no placeholder for everyone else. */}
            <Suspense fallback={null}>
              <FanLineupSection fixture={f} home={home} away={away} />
            </Suspense>
            <LineupPitch
              sides={[
                { key: 'home', team: home, lu: lineupOf(f.h) },
                { key: 'away', team: away, lu: lineupOf(f.a) },
              ]}
            />
          </div>
        }
        room={
          <div className="space-y-5">
            <Suspense fallback={null}>
              <MatchExtras fixture={f} home={home} away={away} />
            </Suspense>
            <Suspense fallback={<div className="skeleton h-48 rounded-lg" aria-hidden="true" />}>
              <MatchRoomSection fixtureId={id} kickoff={f.t} home={home} away={away} />
            </Suspense>
          </div>
        }
      />
    </>
  )
}

async function MatchRoomSection(props: { fixtureId: number; kickoff: number; home: DisplayTeam; away: DisplayTeam }) {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const [initial, hidden, crowd] = await Promise.all([getMatchMessages(props.fixtureId), getBlockedIdsOrNull(), getCrowd(props.fixtureId)])
  // A failed history read is "could not load", never an empty room that fills with live messages only.
  if (!initial || !hidden) return <LoadError />
  const side = (t: DisplayTeam) => ({ id: t.id, short: t.short, bar: t.bar })
  return (
    <MatchRoom
      fixtureId={props.fixtureId}
      kickoff={props.kickoff}
      meId={s.userId}
      myTeamId={s.team.id}
      home={side(props.home)}
      away={side(props.away)}
      initial={initial}
      hidden={hidden}
      crowd={crowd}
    />
  )
}
