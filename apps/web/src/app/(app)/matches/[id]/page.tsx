import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { displayTeam, roundLabelHe } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { getFixtureDetail, getLeague } from '@/features/matches/server/queries'
import { MatchRoom } from '@/features/match-room/components/match-room'
import { getMatchMessages } from '@/features/match-room/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getBlockedIds } from '@/features/safety/server/queries'
import type { DisplayTeam } from '@/features/matches/api-teams'

export default function MatchPage({ params }: PageProps<'/matches/[id]'>) {
  return (
    <section className="space-y-5">
      <Link href="/matches" className="text-sm text-accent-text">
        → כל המשחקים
      </Link>
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden="true" />}>
        {params.then(({ id }) => (
          <MatchContent id={Number(id)} />
        ))}
      </Suspense>
    </section>
  )
}

async function MatchContent({ id }: { id: number }) {
  if (!Number.isInteger(id)) notFound()
  const league = await getLeague()
  const f = league?.fixtures.find((x) => x.id === id)
  if (!league || !f) notFound()
  const home = displayTeam(f.h, league.teams[String(f.h)]?.name)
  const away = displayTeam(f.a, league.teams[String(f.a)]?.name)
  const detail = league.have.includes(id) ? await getFixtureDetail(id) : null
  const goals = detail?.ev.filter((e) => e.type === 'Goal') ?? []
  return (
    <>
      <header className="space-y-3 rounded-lg bg-surface p-5 text-center">
        <p className="text-xs text-muted">
          {roundLabelHe(f.r)} · {kickoffDay(f.t)} {kickoffTime(f.t)}
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <h1 className="font-display text-lg font-black">{home.name}</h1>
          <span className="font-display text-4xl font-black tabular-nums" dir="ltr">
            {f.gh ?? '–'} : {f.ga ?? '–'}
          </span>
          <h2 className="font-display text-lg font-black">{away.name}</h2>
        </div>
        {f.v && <p className="text-xs text-dim">{f.v}</p>}
      </header>
      <section aria-labelledby="goals-title" className="space-y-2">
        <h3 id="goals-title" className="font-bold">
          שערים
        </h3>
        {goals.length ? (
          <ul className="space-y-1.5">
            {goals.map((g, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm">
                <span>⚽ {g.p}</span>
                <span className="tabular-nums text-muted">{g.m}′</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{detail ? 'אין שערים במשחק הזה.' : 'פרטי המשחק עוד לא נטענו.'}</p>
        )}
      </section>
      <Suspense fallback={<div className="skeleton h-48 rounded-lg" aria-hidden="true" />}>
        <MatchRoomSection fixtureId={id} kickoff={f.t} home={home} away={away} />
      </Suspense>
    </>
  )
}

async function MatchRoomSection(props: { fixtureId: number; kickoff: number; home: DisplayTeam; away: DisplayTeam }) {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const [initial, hidden] = await Promise.all([getMatchMessages(props.fixtureId), getBlockedIds()])
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
    />
  )
}
