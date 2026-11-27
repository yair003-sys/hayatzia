import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { connection } from 'next/server'
import {
  BadgeCheck,
  Car,
  ChevronLeft,
  Clapperboard,
  Flame,
  Heart,
  MapIcon,
  Megaphone,
  MessageCircle,
  Music,
  Play,
  Star,
  Trophy,
} from 'lucide-react'
import { Bell } from '@/features/activity/components/bell'
import { getUnreadCount } from '@/features/activity/server/queries'
import { LoadError } from '@/components/load-error'
import { displayTeam } from '@/features/matches/api-teams'
import { kickoffDay, kickoffTime } from '@/features/matches/format'
import { getLeague } from '@/features/matches/server/queries'
import { clubApiIds } from '@/features/stand-home/server/queries'
import { nextClubFixture } from '../../schema'
import { getHotClips } from '../../server/queries'
import { getTeamNews } from '@/features/team-news/server/queries'
import { shortCount, type Clip } from '@/features/square/schema'
import type { Team } from '@/features/teams/data'

const postTime = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
import { Countdown } from '../countdown'
import { fanLevel } from './fan-level'

// onefan home redesign (owner spec 2026-11-27): a premium dark "fan command centre" with a bright-purple brand accent.
// Everything is wired to the real systems — no mock data. The whole screen is wrapped in `.home2`, which scopes the
// purple tokens so no other screen is touched.

const nf = (n: number) => n.toLocaleString('he-IL')

// ── 1. header ───────────────────────────────────────────────────────────────────────
export function HomeHeader({
  team,
  nick,
  avatarUrl,
  points,
  userId,
}: {
  team: Team
  nick: string
  avatarUrl: string | null
  points: number
  userId: string
}) {
  const level = fanLevel(points)
  return (
    <header className="h2-head">
      <Link href="/me" className="h2-id" aria-label="הכרטיס שלי">
        <span className="h2-ava">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" />
          ) : (
            <span className="h2-ava-fallback">{nick.slice(0, 1)}</span>
          )}
          <span className="h2-lvl">Lv.{level}</span>
        </span>
        <span className="h2-id-txt">
          <b>{nick}</b>
          <span className="h2-points">
            <Star className="size-3 fill-current" aria-hidden="true" />
            {nf(points)} נק׳ · {team.short}
          </span>
        </span>
      </Link>
      <div className="h2-head-end">
        <Suspense fallback={<span className="h2-bell-ph" aria-hidden="true" />}>
          <HeaderBell userId={userId} />
        </Suspense>
        <span className="h2-sep" aria-hidden="true" />
        <Link href="/stand" className="h2-logo" aria-label="onefan">
          <b>one<span>fan</span></b>
          <Crown />
        </Link>
      </div>
    </header>
  )
}

async function HeaderBell({ userId }: { userId: string }) {
  const count = await getUnreadCount()
  return <Bell inline meId={userId} count={count} />
}

function Crown() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="h2-crown">
      <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z" fill="currentColor" />
    </svg>
  )
}

// ── 2. next match ───────────────────────────────────────────────────────────────────
function Crest({ short, colors }: { short: string; colors?: { bg: string; bar: string } }) {
  const bg = colors ? `linear-gradient(155deg, ${colors.bar}, ${colors.bg})` : 'linear-gradient(155deg, #3a3346, #241d30)'
  return (
    <span className="h2-crest" style={{ background: bg }} aria-hidden="true">
      {short.slice(0, 3)}
    </span>
  )
}

export async function NextMatchCard({ team }: { team: Team }) {
  await connection()
  const league = await getLeague()
  if (!league) return null
  const ids = clubApiIds(league, team.id)
  const next = nextClubFixture(league.fixtures, ids, Date.now())
  if (!next) {
    // No upcoming match — a calm placeholder, never invented data.
    return (
      <section className="h2-match h2-match-empty" aria-label="המשחק הבא">
        <span className="h2-match-pill">אין משחק קרוב</span>
        <p className="h2-match-empty-txt">אין משחק מתוכנן כרגע. נתראה ביציע בקרוב.</p>
      </section>
    )
  }
  const nameOf = (apiId: number) => displayTeam(apiId, league.teams[String(apiId)]?.name)
  const atHome = ids.includes(next.h)
  const mine = { short: team.short, colors: { bg: team.bg, bar: team.bar } }
  const other = atHome ? nameOf(next.a) : nameOf(next.h)
  const left = atHome ? mine : { short: other.short }
  const right = atHome ? { short: other.short } : mine

  return (
    <section className="h2-match" aria-label="המשחק הבא">
      <span className="h2-match-bg" aria-hidden="true" />
      <div className="h2-match-top">
        <span className="h2-match-pill">{atHome ? 'משחק בית' : 'משחק חוץ'}</span>
        <span className="h2-match-league">ליגת העל{next.dm ? ' · לדוגמה' : ''}</span>
      </div>
      <Link href={`/matches/${next.id}`} className="h2-match-teams" aria-label={`${left.short} נגד ${right.short}`}>
        <span className="h2-match-team">
          <Crest short={left.short} colors={(left as { colors?: { bg: string; bar: string } }).colors} />
          <b>{left.short}</b>
        </span>
        <span className="h2-match-vs" aria-hidden="true">VS</span>
        <span className="h2-match-team">
          <Crest short={right.short} colors={(right as { colors?: { bg: string; bar: string } }).colors} />
          <b>{right.short}</b>
        </span>
      </Link>
      <div className="h2-match-cd">
        <Countdown at={next.t * 1000} />
        <div className="h2-cd-labels" dir="ltr" aria-hidden="true">
          <span>ימים</span>
          <span>שעות</span>
          <span>דקות</span>
          <span>שניות</span>
        </div>
      </div>
      <div className="h2-match-foot">
        <span className="h2-match-when">
          {kickoffDay(next.t)} · {kickoffTime(next.t)}
          {next.v ? ` · ${next.v}` : ''}
        </span>
        <Link href={`/matches/${next.id}`} className="h2-match-cta">
          <Play className="size-4 fill-current" aria-hidden="true" />
          מרכז המשחק
        </Link>
      </div>
    </section>
  )
}

// ── 3. quick actions ────────────────────────────────────────────────────────────────
const QUICK = [
  { href: '/square', label: 'הכיכר', Icon: Clapperboard },
  { href: '/stand/trips', label: 'טרמפים', Icon: Car },
  { href: '/inbox', label: 'הודעות', Icon: MessageCircle },
  { href: '/stand/players', label: 'דירוג שחקנים', Icon: Trophy },
] as const

export function QuickActions() {
  return (
    <section aria-label="פעולות מהירות">
      <SectionHead title="פעולות מהירות" />
      <div className="h2-quick">
        {QUICK.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="h2-quick-card">
            <Icon className="h2-quick-ico" strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── 4. wall preview ─────────────────────────────────────────────────────────────────
export async function WallPreview({ teamId, clubShort }: { teamId: string; clubShort: string }) {
  await connection()
  const news = await getTeamNews()
  if (news === null) return <LoadError compact />
  const posts = news.slice(0, 2)
  return (
    <section aria-label="מה קורה ביציע">
      <SectionHead title="מה קורה ביציע" icon={<MessageCircle className="size-4" aria-hidden="true" />} href="/stand" more="צפה בכל העדכונים" />
      {posts.length === 0 ? (
        <p className="h2-empty">עדיין אין עדכונים בקיר של {clubShort}.</p>
      ) : (
        <ul className="h2-wall">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href="/stand" className="h2-post">
                <span className="h2-post-av" aria-hidden="true">{p.official ? clubShort : (p.authorNick || 'א').slice(0, 1)}</span>
                <span className="h2-post-body">
                  <span className="h2-post-head">
                    <b>{p.authorNick}</b>
                    {p.official && <BadgeCheck className="size-3.5 text-[color:var(--brand2)]" aria-label="רשמי" />}
                    <time className="h2-post-time" dateTime={p.createdAt}>{postTime(p.createdAt)}</time>
                  </span>
                  <span className="h2-post-text">{p.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── 5. trending square ──────────────────────────────────────────────────────────────
export async function TrendingSquare({ meId, teamId }: { meId: string; teamId: string }) {
  await connection()
  const clips = await getHotClips(meId, teamId, 3)
  if (clips === null) return <LoadError compact />
  return (
    <section aria-label="הכיכר חמה עכשיו">
      <SectionHead title="הכיכר חמה עכשיו" icon={<Flame className="size-4 text-[color:var(--warn)]" aria-hidden="true" />} />
      <div className="h2-reels">
        {clips.map((c) => (
          <Link key={c.id} href={`/square?c=${c.id}` as Route} className="h2-reel">
            <Thumb clip={c} />
            <span className="h2-reel-foot">
              <Play className="size-3 fill-current" aria-hidden="true" />
              <Heart className="size-3 fill-current" aria-hidden="true" />
              {shortCount(c.likes_count)}
            </span>
          </Link>
        ))}
        <Link href="/square" className="h2-reel h2-reel-all">
          <Clapperboard className="size-6" aria-hidden="true" />
          <span>לכל הסרטונים</span>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

function Thumb({ clip }: { clip: Clip }) {
  if (!clip.url) return <span className="h2-reel-ph" aria-hidden="true" />
  if (clip.kind === 'video') {
    return <video src={`${clip.url}#t=0.1`} muted playsInline preload="metadata" className="h2-reel-media" aria-hidden="true" />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={clip.url} alt="" className="h2-reel-media" loading="lazy" />
}

// ── 6. community ────────────────────────────────────────────────────────────────────
const COMMUNITY = [
  { href: '/territory', label: 'מלחמת שכונות', sub: 'צובעים את המפה', Icon: MapIcon, tone: 'green' },
  { href: '/stand/chants', label: 'חממת השירים', sub: 'השיר המוביל', Icon: Music, tone: 'purple' },
  { href: '/campaigns', label: 'קמפיינים', sub: 'ביחד למטרה', Icon: Megaphone, tone: 'gold' },
  { href: '/me', label: 'כרטיס האוהד', sub: 'דירוג וסטטיסטיקות', Icon: Star, tone: 'purple' },
] as const

export function CommunityFeatures() {
  return (
    <section aria-label="הקהילה שלך">
      <SectionHead title="הקהילה שלך" />
      <div className="h2-comm">
        {COMMUNITY.map(({ href, label, sub, Icon, tone }) => (
          <Link key={href} href={href as Route} className="h2-comm-card" data-tone={tone}>
            <Icon className="h2-comm-ico" strokeWidth={2} aria-hidden="true" />
            <b>{label}</b>
            <span>{sub}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── shared ──────────────────────────────────────────────────────────────────────────
function SectionHead({ title, icon, href, more }: { title: string; icon?: ReactNode; href?: string; more?: string }) {
  return (
    <div className="h2-sechead">
      <h2>
        {icon}
        {title}
      </h2>
      {href && more && (
        <Link href={href} className="h2-more">
          {more}
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
