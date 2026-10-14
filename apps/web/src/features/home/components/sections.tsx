import type { CSSProperties } from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Users } from 'lucide-react'
import { Brand } from '@/components/brand'
import { Bell } from '@/features/activity/components/bell'
import { getUnreadCount } from '@/features/activity/server/queries'
import { canBuild } from '@/features/lineup/schema'
import { displayTeam } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { getLeague } from '@/features/matches/server/queries'
import { clubApiIds } from '@/features/stand-home/server/queries'
import type { Team } from '@/features/teams/data'
import { homeCircles, nextClubFixture, tableWindow } from '../schema'
import { getActiveFans, getChatPreview, getFansOfWeek, getHomePlayers, getHotClips, getStories } from '../server/queries'
import { ChatPreview } from './chat-preview'
import { FansOfWeek } from './fans-of-week'
import { SectionHead } from './section-head'
import { Countdown } from './countdown'
import { HotClips } from './hot-clips'
import { OnlineTile } from './online-tile'
import { PlayerReviews } from './player-reviews'
import { StoriesRow } from './stories-row'

// The home's sections (redesign 2026-10-14). Each is its own Server Component, rendered by the page inside its own
// <Suspense> so the screen streams section by section; each hides itself when it has nothing to show.

type Fan = { team: Team; userId: string }

// Request time only: every section that reads the clock awaits connection() first (never in a prerender).
const clock = () => Date.now()

// ── 1. header ─────────────────────────────────────────────────────────────────────────────
/** onefan, "האוהדים של <club>" in the club's colour, and the activity bell (the only bell on this screen). */
export function HomeHeader({ team, userId }: Fan) {
  return (
    <header className="hm-head">
      <Brand size={26} className="hm-brand" />
      <h1 className="hm-club">
        <span>האוהדים של</span>
        <b>{team.name}</b>
      </h1>
      <Suspense fallback={<span className="hm-bell-ph" aria-hidden="true" />}>
        <HeaderBell userId={userId} />
      </Suspense>
    </header>
  )
}

async function HeaderBell({ userId }: { userId: string }) {
  const count = await getUnreadCount()
  return <Bell inline meId={userId} count={count} />
}

// ── 2. stories ────────────────────────────────────────────────────────────────────────────
export async function StoriesSection({ team, userId, nick }: Fan & { nick: string }) {
  await connection()
  const [league, groups] = await Promise.all([getLeague(), getStories(team.id, userId)])
  const circles = league ? homeCircles(league.fixtures, clubApiIds(league, team.id), clock()) : { lineup: null, rate: null }
  return (
    <StoriesRow
      groups={groups}
      lineupFixtureId={circles.lineup?.id ?? null}
      rate={circles.rate !== null}
      meId={userId}
      myTeamId={team.id}
      myNick={nick}
      teamShort={team.short}
    />
  )
}

export function StoriesSkeleton() {
  return (
    <div className="hm-stories" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="hm-story">
          <span className="skeleton size-16 rounded-full" />
          <span className="skeleton h-3 w-12 rounded" />
        </span>
      ))}
    </div>
  )
}

// ── 3. tiles ──────────────────────────────────────────────────────────────────────────────
export function ActivityTiles({ team }: { team: Team }) {
  return (
    <div className="hm-tiles">
      <Suspense fallback={<div className="skeleton h-[66px] rounded-[18px]" aria-hidden="true" />}>
        <ActiveFansTile teamId={team.id} />
      </Suspense>
      <OnlineTile />
    </div>
  )
}

/** Always shown (the sketch's place); a dash only where the number cannot be read (no service key in that environment). */
async function ActiveFansTile({ teamId }: { teamId: string }) {
  const n = await getActiveFans(teamId)
  return (
    <div className="hm-tile">
      <Users className="hm-tile-ico" aria-hidden="true" />
      <span className="hm-tile-txt">
        <b className="t-num">{n === null ? '—' : n.toLocaleString('he-IL')}</b>
        <span>אוהדים פעילים</span>
      </span>
    </div>
  )
}

// ── 4. next match ─────────────────────────────────────────────────────────────────────────
export async function NextMatchSection({ team }: { team: Team }) {
  await connection()
  const league = await getLeague()
  if (!league) return null
  const ids = clubApiIds(league, team.id)
  const now = clock()
  const next = nextClubFixture(league.fixtures, ids, now)
  if (!next) return null
  const nameOf = (apiId: number) => displayTeam(apiId, league.teams[String(apiId)]?.name)
  const home = nameOf(next.h)
  const away = nameOf(next.a)
  const atHome = ids.includes(next.h)
  return (
    <section className="hm-next" aria-label="המשחק הבא">
      <p className="hm-next-when">
        המשחק הבא · {kickoffDay(next.t)} {kickoffTime(next.t)}
        {next.dm && <span className="sh-tag ms-2">משחק לדוגמה</span>}
      </p>
      {/* No aria-label here: the link reads its content, so the live countdown (role=timer) is heard too. */}
      <Link href={`/matches/${next.id}`} className="hm-next-row">
        <span className="hm-next-team" data-mine={atHome}>
          {home.short}
          <span className="sr-only"> נגד {away.short},</span>
        </span>
        <Countdown at={next.t * 1000} />
        <span className="hm-next-team" data-mine={!atHome} aria-hidden="true">
          {away.short}
        </span>
      </Link>
      {canBuild(next, now) && (
        <Link href={`/matches/${next.id}?tab=lineup`} className="hm-next-cta">
          בנה את ההרכב שלך
        </Link>
      )}
    </section>
  )
}

// ── 5. players in the fans' eyes ──────────────────────────────────────────────────────────
/** Always shown while the club has a squad (it always has): the cards say "not rated yet" / invite the first review. */
export async function PlayersSection({ team, userId }: Fan) {
  const players = await getHomePlayers(team.id, userId)
  if (players.length === 0) return null
  return (
    <section aria-labelledby="hm-players-h" className="hm-sec">
      <SectionHead id="hm-players-h" title="השחקנים בעיני האוהדים" more={{ href: '/stand/players', label: 'לכל הסגל' }} />
      <PlayerReviews players={players} />
    </section>
  )
}

// ── 6. hot in the Square ──────────────────────────────────────────────────────────────────
/** Always shown; with no posts yet, an empty card the size of the row invites the first upload. */
export async function HotSection({ team, userId, nick }: Fan & { nick: string }) {
  const clips = await getHotClips(userId)
  return (
    <section aria-labelledby="hm-hot-h" className="hm-sec">
      <SectionHead id="hm-hot-h" emoji="🔥" title="החם בכיכר היום" more={{ href: '/square', label: 'לכיכר' }} />
      <HotClips clips={clips} meId={userId} myTeamId={team.id} myNick={nick} teamShort={team.short} />
    </section>
  )
}

// ── 7. team chat ──────────────────────────────────────────────────────────────────────────
/** Always shown; an empty chat invites the first message. */
export async function ChatSection({ team }: { team: Team }) {
  const { messages, hidden } = await getChatPreview(team.id)
  return <ChatPreview teamId={team.id} initial={messages} hidden={hidden} />
}

// ── 8. mini table ─────────────────────────────────────────────────────────────────────────
export async function MiniTableSection({ team }: { team: Team }) {
  const league = await getLeague()
  if (!league) return null
  const ids = clubApiIds(league, team.id)
  const group = league.standings.find((g) => g.some((r) => ids.includes(r.team)))
  const rows = group ? tableWindow(group, ids) : []
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="hm-table-h" className="hm-sec">
      <SectionHead id="hm-table-h" title="הטבלה" more={{ href: '/matches', label: 'לטבלה המלאה' }} />
      <table className="hm-table">
        <colgroup>
          <col style={{ width: 40 }} />
          <col />
          <col style={{ width: 48 }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">מקום</th>
            <th scope="col">קבוצה</th>
            <th scope="col">משחקים</th>
            <th scope="col">נקודות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = displayTeam(r.team, league.teams[String(r.team)]?.name)
            const mine = ids.includes(r.team)
            return (
              <tr key={r.team} data-mine={mine} aria-current={mine ? 'true' : undefined}>
                <td className="t-num">{r.rank}</td>
                <td>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="hm-tdot" style={{ '--a': t.bg, '--b': t.ring } as CSSProperties} aria-hidden="true" />
                    <span className="truncate">{t.short}</span>
                  </span>
                </td>
                <td className="t-num text-muted">{r.p}</td>
                <td className="t-num font-bold">{r.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// ── 9. fans of the week ───────────────────────────────────────────────────────────────────
/** Always shown; before anyone has points this week it says how to get in. */
export async function FansOfWeekSection({ team }: { team: Team }) {
  return <FansOfWeek fans={await getFansOfWeek(team.id)} />
}

/** A section's place while it loads: the shape of what comes, no text. */
export function Skel({ h }: { h: string }) {
  return <div className={`skeleton rounded-[22px] ${h}`} aria-hidden="true" />
}
