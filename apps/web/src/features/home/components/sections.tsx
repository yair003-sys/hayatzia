import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Users } from 'lucide-react'
import { Brand } from '@/components/brand'
import { LoadError } from '@/components/load-error'
import { Bell } from '@/features/activity/components/bell'
import { getUnreadCount } from '@/features/activity/server/queries'
import { HomeCrowdWar } from '@/features/crowd-war/components/crowd-war'
import { canBuild } from '@/features/lineup/schema'
import { displayTeam } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { getLeague } from '@/features/matches/server/queries'
import { clubApiIds } from '@/features/stand-home/server/queries'
import type { Team } from '@/features/teams/data'
import { homeCircles, nextClubFixture } from '../schema'
import { StandingsTable, type StandRow } from './standings-table'
import { getActiveFans, getChatPreview, getFansOfWeek, getHomePlayers, getHotClips, getStories } from '../server/queries'
import { getSquadWithRatings } from '@/features/ratings/server/queries'
import { PlayersPanel } from './players-panel'
import { ChatPreview } from './chat-preview'
import { FansOfWeek } from './fans-of-week'
import { SectionHead } from './section-head'
import { Countdown } from './countdown'
import { HotClips } from './hot-clips'
import { OnlineTile } from './online-tile'
import { StoriesRow } from './stories-row'

// The home's sections (redesign 2026-10-14). Each is its own Server Component, rendered by the page inside its own
// <Suspense> so the screen streams section by section. They always show, with an empty state when there is no data
// yet (owner, 2026-10-14); only the next match and the mini table are left out when there is no match or table.
// A section whose read failed says "לא הצלחנו לטעון. נסה שוב" instead of its empty state (load test 2026-10-17,
// finding 6): an empty state is a claim about the data.

type Fan = { team: Team; userId: string }

// Request time only: every section that reads the clock awaits connection() first (never in a prerender).
const clock = () => Date.now()

// ── 1. header ─────────────────────────────────────────────────────────────────────────────
/** onefan, "האוהדים של <club>" in the club's colour, and the activity bell (the only bell on this screen). */
export function HomeHeader({ team, userId }: Fan) {
  return (
    // The same pinned top bar as every screen (owner, 2026-10-15): it stays while the home scrolls.
    <header className="hm-head topbar">
      <Link href="/stand" aria-label="onefan, למסך הראשי" className="topbar-home">
        <Brand size={24} className="hm-brand" />
      </Link>
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
  if (!groups) return <LoadError compact />
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

// ── 4. match extras (crowd war + build lineup) ──────────────────────────────────────────────
/**
 * The match-day actions under the lit hero: the crowd-war poll and "build your lineup". The teams, countdown and
 * kick-off time now live once, in MatchNightHero at the top, so this section no longer repeats them (owner 2026-10-18:
 * "the order isn't good, there are duplicates"). Same data, same place in the flow — just without the duplicate card.
 */
export async function MatchExtras({ team }: { team: Team }) {
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
  return (
    <section className="hm-next" aria-label="מלחמת הקהלים">
      <Suspense fallback={<div className="skeleton h-24 rounded-2xl" aria-hidden="true" />}>
        <HomeCrowdWar fixture={next} home={home} away={away} />
      </Suspense>
    </section>
  )
}

// ── match-night hero (owner 2026-10-18) ────────────────────────────────────────────────────
/**
 * The lit "next match" moment at the very top of the home: a single dark stadium card with floodlight beams, a crowd
 * shimmer and a live countdown, all in the fan's club colour. Added above the otherwise-unchanged home, and shown only
 * when there is an upcoming match — on other days it renders nothing, so the rest of the screen stays exactly as it was.
 * Reuses the same data and the same <Countdown> as the plain next-match strip below. Decorative layers are clipped
 * inside the card, so it cannot widen the page (the 375px rule).
 */
export async function MatchNightHero({ team }: { team: Team }) {
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
  const fans = await getActiveFans(team.id)
  return (
    <section className="mnh" aria-label="המשחק הבא">
      <span className="mnh-beam mnh-beam-1" aria-hidden="true" />
      <span className="mnh-beam mnh-beam-2" aria-hidden="true" />
      <span className="mnh-beam mnh-beam-3" aria-hidden="true" />
      <span className="mnh-mosaic" aria-hidden="true" />
      <p className="mnh-label">
        <i className="mnh-dot" aria-hidden="true" />
        המשחק הבא
        {next.dm && <span className="sh-tag ms-2">משחק לדוגמה</span>}
      </p>
      <Link href={`/matches/${next.id}`} className="mnh-teams" aria-label={`${home.short} נגד ${away.short}`}>
        <span className="mnh-team" data-mine={atHome}>
          {home.short}
          <small>{atHome ? 'בבית' : 'בחוץ'}</small>
        </span>
        <span className="mnh-vs" aria-hidden="true">נגד</span>
        <span className="mnh-team" data-mine={!atHome}>
          {away.short}
          <small>{atHome ? 'בחוץ' : 'בבית'}</small>
        </span>
      </Link>
      <div className="mnh-cd">
        <Countdown at={next.t * 1000} />
      </div>
      <p className="mnh-when">
        {kickoffDay(next.t)} · {kickoffTime(next.t)}
        {next.v ? ` · ${next.v}` : ''}
      </p>
      {fans !== null && fans > 0 && (
        <p className="mnh-fans">
          <i className="mnh-pulse" aria-hidden="true" />
          יחד איתך עכשיו <b>{fans.toLocaleString('he-IL')}</b> אוהדים
        </p>
      )}
      {canBuild(next, now) ? (
        <Link href={`/matches/${next.id}?tab=lineup`} className="mnh-cta">
          בנה את ההרכב שלך
        </Link>
      ) : (
        <Link href="/stand/chat" className="mnh-cta">
          לצ׳אט היציע
        </Link>
      )}
    </section>
  )
}

// ── 5. players in the fans' eyes ──────────────────────────────────────────────────────────
/** Always shown while the club has a squad (it always has): the cards say "not rated yet" / invite the first review. */
/**
 * One players area (owner 2026-10-18, "make it cleaner"): the tap-to-rate pitch and the fans' moving reviews under a
 * single heading, switched by a "מגרש / רשימה" toggle instead of two stacked sections. Both datasets load here on the
 * server and the toggle flips between them on the client.
 */
export async function PlayersSection({ team, userId }: Fan) {
  const [players, squad] = await Promise.all([getHomePlayers(team.id, userId), getSquadWithRatings(team.id, userId)])
  if (squad.length === 0 && (players === null || players.length === 0)) return null
  return (
    <section aria-labelledby="hm-players-h" className="hm-sec">
      <SectionHead id="hm-players-h" title="דרג את השחקנים" more={{ href: '/stand/players', label: 'לכל הסגל' }} />
      <PlayersPanel team={team} players={players} squad={squad} />
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
      {clips ? <HotClips clips={clips} meId={userId} myTeamId={team.id} myNick={nick} teamShort={team.short} /> : <LoadError compact />}
    </section>
  )
}

// ── 7. team chat ──────────────────────────────────────────────────────────────────────────
/** Always shown; an empty chat invites the first message. */
export async function ChatSection({ team }: { team: Team }) {
  const preview = await getChatPreview(team.id)
  if (!preview) {
    return (
      <section aria-labelledby="hm-chat-h" className="hm-chat">
        <h2 id="hm-chat-h" className="hm-h2">
          עכשיו בצ׳אט של האוהדים
        </h2>
        <LoadError compact />
        <Link href="/stand/chat" className="hm-join">
          הצטרף לשיחה
        </Link>
      </section>
    )
  }
  return <ChatPreview teamId={team.id} initial={preview.messages} hidden={preview.hidden} />
}

// ── 8. mini table ─────────────────────────────────────────────────────────────────────────
export async function MiniTableSection({ team }: { team: Team }) {
  const league = await getLeague()
  if (!league) return null
  const ids = clubApiIds(league, team.id)
  const group = league.standings.find((g) => g.some((r) => ids.includes(r.team)))
  if (!group || group.length === 0) return null
  const rows: StandRow[] = group.map((r) => {
    const t = displayTeam(r.team, league.teams[String(r.team)]?.name)
    return { team: r.team, rank: r.rank, short: t.short, bg: t.bg, ring: t.ring, p: r.p, pts: r.pts, mine: ids.includes(r.team) }
  })
  if (!rows.some((r) => r.mine)) return null
  return (
    <section aria-labelledby="hm-table-h" className="hm-sec">
      <SectionHead id="hm-table-h" title="הטבלה" />
      {/* The full table opens here on the same page (owner 2026-10-18), instead of a link to /matches. */}
      <StandingsTable rows={rows} />
    </section>
  )
}

// ── 9. fans of the week ───────────────────────────────────────────────────────────────────
/** Always shown; before anyone has points this week it says how to get in. */
export async function FansOfWeekSection({ team }: { team: Team }) {
  const fans = await getFansOfWeek(team.id)
  if (!fans) {
    return (
      <section aria-labelledby="hm-fans-h" className="hm-sec">
        <SectionHead id="hm-fans-h" emoji="🏆" title="אוהדי השבוע" />
        <LoadError compact />
      </section>
    )
  }
  return <FansOfWeek fans={fans} />
}

/** A section's place while it loads: the shape of what comes, no text. */
export function Skel({ h }: { h: string }) {
  return <div className={`skeleton rounded-[22px] ${h}`} aria-hidden="true" />
}
