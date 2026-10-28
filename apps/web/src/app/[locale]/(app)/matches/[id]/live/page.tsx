import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { displayTeam } from '@/features/matches/api-teams'
import type { DisplayTeam } from '@/features/matches/api-teams'
import { sideScore } from '@/features/matches/live'
import { getFixtureDetail, getLeague } from '@/features/matches/server/queries'
import { isTicketLive, minuteLabel } from '@/features/stand-home/schema'
import { LineupPitch } from '@/features/matches/components/lineup-pitch'
import { MatchEvents } from '@/features/matches/components/match-events'
import { MatchRoom } from '@/features/match-room/components/match-room'
import { getMatchMessages } from '@/features/match-room/server/queries'
import { getCrowd } from '@/features/crowd-verdict/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { LoadError } from '@/components/load-error'
import { FanLineupSection } from '@/features/lineup/components/fan-lineup-section'
import { LineupScreen } from '@/features/match-room/components/lineup-screen'
import { LiveMatchCenter } from '@/features/match-room/components/live-match-center'

const clock = () => Date.now()

export default function LiveCenterPage({ params }: PageProps<'/matches/[id]/live'>) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => (
        <Content id={Number(id)} />
      ))}
    </Suspense>
  )
}

async function Content({ id }: { id: number }) {
  if (!Number.isInteger(id)) notFound()
  const league = await getLeague()
  const f = league?.fixtures.find((x) => x.id === id)
  if (!league || !f) notFound()
  const home = displayTeam(f.h, league.teams[String(f.h)]?.name)
  const away = displayTeam(f.a, league.teams[String(f.a)]?.name)
  const detail = league.have.includes(id) ? await getFixtureDetail(id) : null
  const session = await getSessionProfile()
  // The fan line-up tab shows only for a fan of one of the two clubs (otherwise there's nothing to build).
  const showFan = session.status === 'ready' && (session.team.id === home.id || session.team.id === away.id)
  await connection()
  const now = clock()
  const lineupOf = (apiId: number) => detail?.lu.find((l) => l.team === apiId) ?? null

  const events = (
    <MatchEvents
      events={detail?.ev ?? []}
      home={{ apiId: f.h, team: home }}
      away={{ apiId: f.a, team: away }}
      empty={detail ? 'עוד אין אירועים במשחק.' : 'פרטי המשחק עוד לא נטענו.'}
    />
  )
  const lineup = (
    <LineupScreen
      hasFan={showFan}
      match={
        <LineupPitch
          events={detail?.ev}
          sides={[
            { key: 'home', team: home, lu: lineupOf(f.h) },
            { key: 'away', team: away, lu: lineupOf(f.a) },
          ]}
        />
      }
      fan={
        <Suspense fallback={null}>
          <FanLineupSection fixture={f} home={home} away={away} />
        </Suspense>
      }
    />
  )
  // The live battle bar (over the chat) is the match-time momentum meter; the pre-match tug-of-war stays on the match page.
  const battlePanel = (
    <Suspense fallback={<div className="skeleton h-48 rounded-lg" aria-hidden="true" />}>
      <RoomSection fixtureId={id} kickoff={f.t} home={home} away={away} />
    </Suspense>
  )

  return (
    <LiveMatchCenter
      home={home}
      away={away}
      score={sideScore(f)}
      minute={minuteLabel(f, now)}
      live={isTicketLive(f, now)}
      backHref={`/matches/${id}`}
      panels={[
        { key: 'battle', label: 'מלחמת אוהדים וצ׳אט', node: battlePanel },
        { key: 'lineup', label: 'הרכב', node: lineup },
        { key: 'events', label: 'אירועים', node: events },
      ]}
    />
  )
}

async function RoomSection(props: { fixtureId: number; kickoff: number; home: DisplayTeam; away: DisplayTeam }) {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const [initial, hidden, crowd] = await Promise.all([getMatchMessages(props.fixtureId), getBlockedIdsOrNull(), getCrowd(props.fixtureId)])
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
      battle
    />
  )
}
