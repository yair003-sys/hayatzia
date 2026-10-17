import type { CSSProperties } from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Bell } from '@/features/activity/components/bell'
import { getUnreadCount } from '@/features/activity/server/queries'
import { displayTeam } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { getLeague } from '@/features/matches/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { isTicketLive, pickTicket, teamAccent } from '@/features/stand-home/schema'
import { clubApiIds } from '@/features/stand-home/server/queries'
import { roomState } from '@/features/match-room/schema'
import { CheckinButton } from '@/features/stage4/components/checkin-button'
import { getCheckedIn } from '@/features/stage4/server/queries'
import type { Team } from '@/features/teams/data'
import { LoadError } from '@/components/load-error'
import { nextClubFixture } from '../../schema'
import { getActiveFans } from '../../server/queries'
import { ChatSection } from '../sections'
import { Countdown } from '../countdown'

// Stadium home (stadium redesign, 2026-10-17, behind the onefan_design cookie). A parallel look to the classic home:
// it reuses the SAME server reads (session, league, active fans, chat preview) and the same honest states — a read
// that failed says "לא הצלחנו לטעון", an empty read gets a friendly line. Every colour comes from the fan's club
// through teamAccent (var(--acc)); only the onefan wordmark is the brand green. The look is CSS in globals.css under
// the .std scope; the floodlights and the crowd shimmer stop for prefers-reduced-motion.

const clock = () => Date.now()

/** The whole screen. Signed-out (and CI with no Supabase) shows the stadium shell with the wordmark, nothing personal. */
export async function StadiumHome() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return (
      <div className="std">
        <h1 className="std-wordmark t-page" dir="ltr">
          onefan
        </h1>
      </div>
    )
  }
  const { team, userId } = s
  const acc = teamAccent(team.bar)
  const theme = { '--t-acc': acc.accent, '--t-acc2': acc.accent2, '--t-rgb': acc.rgb, '--t-text': acc.text, '--t-on': acc.on } as CSSProperties
  return (
    <div className="std" style={theme}>
      <StadiumHeader team={team} userId={userId} />
      <div className="std-stage">
        <Suspense fallback={<div className="std-card skeleton h-12" aria-hidden="true" />}>
          <StadiumCrowd teamId={team.id} />
        </Suspense>
        <Suspense fallback={<div className="std-card skeleton h-56" aria-hidden="true" />}>
          <StadiumKickoff team={team} />
        </Suspense>
        <Suspense fallback={null}>
          <StadiumCheckin team={team} />
        </Suspense>
        <Suspense fallback={<div className="std-card skeleton h-52" aria-hidden="true" />}>
          <div className="std-chat-wrap">
            <ChatSection team={team} />
          </div>
        </Suspense>
      </div>
    </div>
  )
}

/** The wordmark (brand green), the club name, and the one activity bell this screen carries (the floating one hides). */
function StadiumHeader({ team, userId }: { team: Team; userId: string }) {
  return (
    <header className="std-head">
      <Link href="/stand" aria-label="onefan, למסך הראשי" className="std-wordmark-link">
        <span dir="ltr" className="std-wordmark">
          onefan
        </span>
      </Link>
      <h1 className="std-head-club">
        <span>האוהדים של</span>
        <b>{team.name}</b>
      </h1>
      <Suspense fallback={<span className="hm-bell-ph" aria-hidden="true" />}>
        <StadiumBell userId={userId} />
      </Suspense>
    </header>
  )
}

async function StadiumBell({ userId }: { userId: string }) {
  const count = await getUnreadCount()
  return <Bell inline meId={userId} count={count} />
}

/** "יחד איתך עכשיו N אוהדים": the club's active-fans number (the same cached read as the classic home). A dash, never
 *  a made-up 0, when the number cannot be read (no service key in this environment). */
async function StadiumCrowd({ teamId }: { teamId: string }) {
  const n = await getActiveFans(teamId)
  return (
    <p className="std-crowd">
      <span className="std-crowd-dot" aria-hidden="true" />
      {/* A club-coloured cluster of fan heads behind the number: decoration, not real people, so it is hidden from
          screen readers. The number itself is the real active-fans count. */}
      <span className="std-faces" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      יחד איתך עכשיו <b className="std-score">{n === null ? '—' : n.toLocaleString('he-IL')}</b> אוהדים
    </p>
  )
}

/** The check-in moment ("אני ביציע הערב"): the real "הייתי שם" action, shown only while a match of the fan's club is
 *  live or around kick-off (the exact window the match page uses). Never shown otherwise, never faked. */
async function StadiumCheckin({ team }: { team: Team }) {
  await connection()
  const league = await getLeague()
  if (!league) return null
  const ids = clubApiIds(league, team.id)
  const ticket = pickTicket(league.fixtures, ids, clock())
  if (!ticket) return null
  const active = ['open', 'closing'].includes(roomState(ticket.t, clock()))
  if (!active) return null
  const live = isTicketLive(ticket, clock())
  const checked = await getCheckedIn(ticket.id)
  return (
    <section className="std-checkin" aria-label="צ׳ק-אין למשחק">
      <p className="std-checkin-head">
        {live && <span className="std-live-dot" aria-hidden="true" />}
        {live ? 'המשחק חי עכשיו' : 'ערב משחק'}
      </p>
      <p className="std-checkin-sub">אתה באצטדיון? תן לכולם לדעת שאתה ביציע הערב.</p>
      <CheckinButton fixtureId={ticket.id} done={checked} label={team.short} haptics />
    </section>
  )
}

/** The next match as the stadium hero: a live countdown to kick-off over the two clubs. A failed league read says so;
 *  no upcoming match gets a friendly line (never a fake match). */
async function StadiumKickoff({ team }: { team: Team }) {
  await connection()
  const league = await getLeague()
  if (!league) {
    return (
      <section className="std-card">
        <LoadError compact />
      </section>
    )
  }
  const ids = clubApiIds(league, team.id)
  const now = clock()
  const next = nextClubFixture(league.fixtures, ids, now)
  if (!next) {
    return (
      <section className="std-kick std-kick-empty" aria-label="המשחק הבא">
        <span className="std-kick-mosaic" aria-hidden="true" />
        <p className="std-kick-eyebrow">אין משחק קרוב בלוח</p>
        <p className="std-title">האורות ייידלקו כאן</p>
        <p className="std-kick-rest">כשייקבע המשחק הבא, הספירה לאחור תתחיל כאן. בינתיים — נתראה ביציע.</p>
      </section>
    )
  }
  const nameOf = (apiId: number) => displayTeam(apiId, league.teams[String(apiId)]?.name)
  const home = nameOf(next.h)
  const away = nameOf(next.a)
  const atHome = ids.includes(next.h)
  return (
    <section className="std-kick std-kick-hero" aria-label="המשחק הבא">
      <span className="std-kick-mosaic" aria-hidden="true" />
      <p className="std-kick-eyebrow">
        המשחק הבא · {kickoffDay(next.t)} {kickoffTime(next.t)}
        {next.dm && <span className="sh-tag ms-2">משחק לדוגמה</span>}
      </p>
      {/* No aria-label: the link reads its own content, so the live countdown (role=timer) is heard too. */}
      <Link href={`/matches/${next.id}`} className="std-kick-row">
        <span className="std-kick-team std-score" data-mine={atHome}>
          {home.short}
          <span className="sr-only"> נגד {away.short},</span>
        </span>
        <span className="std-kick-vs" aria-hidden="true">נגד</span>
        <span className="std-kick-team std-score" data-mine={!atHome} aria-hidden="true">
          {away.short}
        </span>
      </Link>
      <div className="std-kick-clock">
        <Countdown at={next.t * 1000} />
      </div>
    </section>
  )
}
