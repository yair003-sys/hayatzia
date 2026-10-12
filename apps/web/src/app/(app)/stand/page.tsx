import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Suspense } from 'react'
import { Car, ChevronLeft } from 'lucide-react'
import { displayTeam } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { LIVE_STATUSES } from '@/features/matches/schema'
import { getLeague } from '@/features/matches/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { FanPitch } from '@/features/stand-home/components/fan-pitch'
import { Hero } from '@/features/stand-home/components/hero'
import { MatchTicket } from '@/features/stand-home/components/match-ticket'
import { TeamChatCard } from '@/features/stand-home/components/team-chat-card'
import { pickTicket, teamAccent } from '@/features/stand-home/schema'
import { clubApiIds, getStandHome } from '@/features/stand-home/server/queries'

export const metadata: Metadata = { title: 'היציע שלי' }

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-hidden="true">
          <div className="skeleton h-52 rounded-3xl" />
          <div className="skeleton h-44 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
        </div>
      }
    >
      <StandHome />
    </Suspense>
  )
}

const clock = () => Date.now()

async function StandHome() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return <h1 className="font-display text-3xl font-black">היציע שלי</h1>
  const team = s.team
  const league = await getLeague()
  const ids = clubApiIds(league, team.id)
  const now = clock()
  const ticket = league ? pickTicket(league.fixtures, ids, now) : null
  const next =
    league?.fixtures
      .filter((f) => (ids.includes(f.h) || ids.includes(f.a)) && f.t * 1000 > now)
      .sort((a, b) => a.t - b.t)[0] ?? null
  const data = await getStandHome(team.id, s.userId, next?.id ?? null)
  const acc = teamAccent(team.bar)
  const theme = { '--t-acc': acc.accent, '--t-acc2': acc.accent2, '--t-rgb': acc.rgb, '--t-text': acc.text, '--t-on': acc.on } as CSSProperties
  const nameOf = (apiId: number) => displayTeam(apiId, league?.teams[String(apiId)]?.name)

  return (
    <div className="sh space-y-4" style={theme}>
      <Hero team={team} fans={data.fans} />

      <h2 className="sh-sec">
        {ticket && LIVE_STATUSES.has(ticket.st) && <i className="sh-live-dot" aria-hidden="true" />}
        יום משחק
      </h2>
      {ticket ? (
        <MatchTicket fixture={ticket} home={nameOf(ticket.h)} away={nameOf(ticket.a)} />
      ) : (
        <p className="sh-card text-sm text-muted">אין כרגע משחקים בלוח.</p>
      )}

      <h2 className="sh-sec">הצ׳אט של הקבוצה</h2>
      <TeamChatCard teamId={team.id} short={team.short} initial={data.chat} hidden={data.hidden} />

      <Link href="/stand/trips" className="sh-card">
        <span className="sh-card-h">
          <Car className="size-5" aria-hidden="true" />
          <b>נוסעים למשחק</b>
          <span className="sh-chip open">{data.trips} נסיעות</span>
          <ChevronLeft className="size-4 text-dim" aria-hidden="true" />
        </span>
        {next ? (
          <span className="sh-pv">
            <b>המשחק הבא:</b> {ids.includes(next.h) ? 'בבית' : 'בחוץ'} מול {nameOf(ids.includes(next.h) ? next.a : next.h).short} ·{' '}
            {kickoffDay(next.t)} {kickoffTime(next.t)}
          </span>
        ) : (
          <span className="sh-pv">אין משחק קרוב</span>
        )}
        <span className="sh-pv">מוצאים פרטנרים לנסיעה, ומתאמים בשיחה פרטית</span>
      </Link>

      <nav className="sh-tiles" aria-label="עוד ביציע">
        <Link href="/stand/events" className="sh-tile">
          <i aria-hidden="true">📅</i>
          <b>אירועים</b>
          <span>{data.events} קרובים</span>
        </Link>
        <Link href="/stand/market" className="sh-tile">
          <i aria-hidden="true">🧣</i>
          <b>שוק אוהדים</b>
          <span>{data.market} מודעות</span>
        </Link>
        <Link href="/stand/photos" className="sh-tile">
          <i aria-hidden="true">🖼️</i>
          <b>תמונות</b>
          <span>מהיציע</span>
        </Link>
      </nav>

      <div className="flex items-center justify-between gap-3">
        <h2 className="sh-sec flex-1">ההרכב של האוהדים</h2>
        <Link href="/stand/players" className="mt-2 shrink-0 rounded-full border border-line bg-white/4 px-3.5 py-1.5 text-[13px] font-bold">
          כל הדירוגים
        </Link>
      </div>
      <FanPitch team={team} initial={data.squad} />
    </div>
  )
}
