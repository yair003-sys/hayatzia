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
  Megaphone,
  MessageCircle,
  MessageSquare,
  Music,
  Play,
  Share2,
  Star,
  Trophy,
  Zap,
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
import { totalReactions } from '@/features/team-news/schema'
import { shortCount, type Clip } from '@/features/square/schema'
import type { Team } from '@/features/teams/data'
import { Countdown } from '../countdown'
import { fanLevel } from './fan-level'
import { upcomingTeamMatches } from '@/features/team-life/server/matches'
import { getTrips } from '@/features/team-life/server/queries'
import { getSquadWithRatings } from '@/features/ratings/server/queries'
import { getChants } from '@/features/stage4/server/queries'
import { getLiveCampaigns } from '@/features/campaigns/server/queries'
import { moneyLabel, progressPct } from '@/features/campaigns/schema'

// onefan home redesign (owner spec 2026-11-27, full mockup): a premium dark "fan command centre" with a bright-purple
// brand accent and a stadium hero. Every section is wired to the real systems — no mock data. The whole screen is
// wrapped in `.home2`, which scopes the purple tokens so no other screen is touched.

const nf = (n: number) => n.toLocaleString('he-IL')
// Request time only (every reader awaits connection() first), via a helper so it isn't an impure call in render.
const clock = () => Date.now()

/** "לפני N דק׳/שע׳/ימים" from an ISO time and the request's clock — pure given its args. */
function relTime(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'עכשיו'
  const m = Math.floor(s / 60)
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.floor(m / 60)
  if (h < 24) return `לפני ${h} שע׳`
  return `לפני ${Math.floor(h / 24)} ימים`
}

// ── crest ─────────────────────────────────────────────────────────────────────────
/** Real club crest from the API logo when we have one; otherwise a colour disc with the short name — never invented. */
function Crest({ logo, short, colors }: { logo?: string; short: string; colors?: { bg: string; bar: string } }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className="h2-crest h2-crest-img" aria-hidden="true" />
  }
  const bg = colors ? `linear-gradient(155deg, ${colors.bar}, ${colors.bg})` : 'linear-gradient(155deg, #3a3346, #241d30)'
  return (
    <span className="h2-crest" style={{ background: bg }} aria-hidden="true">
      {short.slice(0, 3)}
    </span>
  )
}

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
      <Link href="/stand" className="h2-logo" aria-label="onefan">
        <b>one<span>fan</span></b>
        <Crown />
      </Link>
      <Link href="/me" className="h2-id" aria-label="הכרטיס שלי">
        <span className="h2-id-txt">
          <b>{nick} <ChevronDown /></b>
          <span className="h2-points">
            <Star className="size-3 fill-current" aria-hidden="true" />
            נקודות {nf(points)}
          </span>
        </span>
        <span className="h2-ava">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" />
          ) : (
            <span className="h2-ava-fallback">{nick.slice(0, 1)}</span>
          )}
          <span className="h2-lvl">Lv.{level}</span>
        </span>
      </Link>
      <Suspense fallback={<span className="h2-bell-ph" aria-hidden="true" />}>
        <HeaderBell userId={userId} />
      </Suspense>
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

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" className="h2-chev">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── 2. next match ───────────────────────────────────────────────────────────────────
export async function NextMatchCard({ team }: { team: Team }) {
  await connection()
  const league = await getLeague()
  if (!league) return null
  const ids = clubApiIds(league, team.id)
  const next = nextClubFixture(league.fixtures, ids, clock())
  if (!next) {
    return (
      <section className="h2-match h2-match-empty" aria-label="המשחק הבא">
        <span className="h2-match-pill">אין משחק קרוב</span>
        <p className="h2-match-empty-txt">אין משחק מתוכנן כרגע. נתראה ביציע בקרוב.</p>
      </section>
    )
  }
  const logoOf = (apiId: number) => league.teams[String(apiId)]?.logo || undefined
  const nameOf = (apiId: number) => displayTeam(apiId, league.teams[String(apiId)]?.name)
  const atHome = ids.includes(next.h)
  const mine = { name: team.name, short: team.short, logo: logoOf(atHome ? next.h : next.a), colors: { bg: team.bg, bar: team.bar } }
  const rivalId = atHome ? next.a : next.h
  const rival = { ...nameOf(rivalId), logo: logoOf(rivalId) }
  const left = atHome ? mine : rival
  const right = atHome ? rival : mine

  return (
    <section className="h2-match" aria-label="המשחק הבא">
      <span className="h2-match-bg" aria-hidden="true" />
      <span className="h2-match-shade" aria-hidden="true" />
      <div className="h2-match-top">
        <span className="h2-match-pill">
          <HomeGlyph />
          {atHome ? 'משחק בית' : 'משחק חוץ'}
        </span>
        <span className="h2-match-league">
          ליגת העל{next.dm ? ' · לדוגמה' : ''}
          <BallGlyph />
        </span>
      </div>
      <Link href={`/matches/${next.id}`} className="h2-match-teams" aria-label={`${left.name} נגד ${right.name}`}>
        <span className="h2-match-team">
          <Crest logo={left.logo} short={left.short} colors={(left as { colors?: { bg: string; bar: string } }).colors} />
          <b>{left.name}</b>
        </span>
        <span className="h2-match-vs" aria-hidden="true">VS</span>
        <span className="h2-match-team">
          <Crest logo={right.logo} short={right.short} colors={(right as { colors?: { bg: string; bar: string } }).colors} />
          <b>{right.name}</b>
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
          <CalGlyph />
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

function HomeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
function BallGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 5h-5L8 10z" />
    </svg>
  )
}
function CalGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

// ── 3. quick actions ────────────────────────────────────────────────────────────────
const QUICK = [
  { href: '/square', label: 'הכיכר', Icon: Clapperboard },
  { href: '/stand/trips', label: 'טרמפים', Icon: Car },
  { href: '/inbox', label: 'הודעות', Icon: MessageSquare },
  { href: '/stand/players', label: 'דירוג שחקנים', Icon: Trophy },
] as const

export function QuickActions() {
  return (
    <section aria-label="פעולות מהירות">
      <SectionHead title="פעולות מהירות" icon={<Zap className="size-4 text-[color:var(--brand2)]" aria-hidden="true" />} />
      <div className="h2-quick">
        {QUICK.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="h2-quick-card">
            <span className="h2-quick-ico-wrap"><Icon className="h2-quick-ico" strokeWidth={2} aria-hidden="true" /></span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── 4. featured wall post ───────────────────────────────────────────────────────────
export async function WallPreview({ clubShort }: { clubShort: string }) {
  await connection()
  const news = await getTeamNews()
  if (news === null) return <LoadError compact />
  const post = news[0]
  return (
    <section aria-label="מה קורה ביציע">
      <SectionHead title="מה קורה ביציע" icon={<MessageCircle className="size-4" aria-hidden="true" />} href="/stand/wall" more="לכל העדכונים" />
      {!post ? (
        <p className="h2-empty">עדיין אין עדכונים בקיר של {clubShort}.</p>
      ) : (
        <Link href={'/stand/wall' as Route} className="h2-feat">
          {post.mediaUrl && (
            <span className="h2-feat-media" aria-hidden="true">
              {post.mediaKind === 'video' ? (
                <>
                  <video src={`${post.mediaUrl}#t=0.1`} muted playsInline preload="metadata" className="h2-feat-media-el" />
                  <span className="h2-feat-play"><Play className="size-5 fill-current" /></span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.mediaUrl} alt="" className="h2-feat-media-el" loading="lazy" />
              )}
            </span>
          )}
          <span className="h2-feat-body">
            <span className="h2-feat-head">
              <span className="h2-feat-av" aria-hidden="true">{post.official ? clubShort : (post.authorNick || 'א').slice(0, 1)}</span>
              <span className="h2-feat-id">
                <b>{post.authorNick}{post.official && <BadgeCheck className="size-4 text-[color:var(--brand2)]" aria-label="רשמי" />}</b>
                <time className="h2-feat-time" dateTime={post.createdAt}>{relTime(post.createdAt, clock())}</time>
              </span>
              {post.official && <span className="h2-feat-tag">הודעה רשמית</span>}
            </span>
            {post.title && <b className="h2-feat-title">{post.title}</b>}
            <span className="h2-feat-text">{post.body}</span>
            <span className="h2-feat-stats">
              <span><Heart className="size-4 fill-current" aria-hidden="true" />{shortCount(totalReactions(post.reactions))}</span>
              <span><MessageCircle className="size-4" aria-hidden="true" />{shortCount(post.comments)}</span>
              <span><Share2 className="size-4" aria-hidden="true" />שתף</span>
            </span>
          </span>
        </Link>
      )}
    </section>
  )
}

// ── 5. trending square ──────────────────────────────────────────────────────────────
export async function TrendingSquare({ meId, teamId }: { meId: string; teamId: string }) {
  await connection()
  const clips = await getHotClips(meId, teamId, 3)
  if (clips === null) return <LoadError compact />
  if (clips.length === 0) return null
  return (
    <section aria-label="הכיכר חמה עכשיו">
      <SectionHead title="הכיכר חמה עכשיו" icon={<Flame className="size-4 text-[color:var(--warn)]" aria-hidden="true" />} />
      <div className="h2-reels">
        {clips.map((c) => (
          <Link key={c.id} href={`/square?c=${c.id}` as Route} className="h2-reel">
            <Thumb clip={c} />
            <span className="h2-reel-foot">
              <Heart className="size-3 fill-current" aria-hidden="true" />
              {shortCount(c.likes_count)}
            </span>
            <span className="h2-reel-play" aria-hidden="true"><Play className="size-4 fill-current" /></span>
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

// ── 6. trips teaser ─────────────────────────────────────────────────────────────────
export async function TripsTeaser({ team, userId }: { team: Team; userId: string }) {
  await connection()
  const league = await getLeague()
  const matches = upcomingTeamMatches(league, team.id)
  const trips = matches.length ? await getTrips(matches.map((m) => m.id), userId) : []
  if (trips === null) return null
  const offers = trips.filter((t) => t.kind === 'offer')
  const seats = offers.reduce((n, t) => n + (t.seats || 0), 0)
  const avatars = trips.slice(0, 3)
  return (
    <section aria-label="מתארגנים למשחק הבא">
      <SectionHead title="מתארגנים למשחק הבא" icon={<Car className="size-4 text-[color:var(--brand2)]" aria-hidden="true" />} />
      <Link href="/stand/trips" className="h2-trips">
        <span className="h2-trips-avs" aria-hidden="true">
          {avatars.map((t, i) => (
            <span key={t.id} className="h2-trips-av" style={{ zIndex: 3 - i }}>{(t.nick || 'א').slice(0, 1)}</span>
          ))}
          {trips.length > avatars.length && <span className="h2-trips-more">+{trips.length - avatars.length}</span>}
        </span>
        <span className="h2-trips-body">
          <b>{trips.length > 0 ? `${trips.length} טרמפים פעילים` : 'אין טרמפים עדיין'}</b>
          <span>{trips.length > 0 ? `${offers.length} נהגים · ${seats} מקומות פנויים` : 'תהיה הראשון להציע נסיעה'}</span>
        </span>
        <span className="h2-trips-cta">לכל הטרמפים<ChevronLeft className="size-4" aria-hidden="true" /></span>
      </Link>
    </section>
  )
}

// ── 7. ratings + songs split ────────────────────────────────────────────────────────
export async function RatingsAndSongs({ team, userId }: { team: Team; userId: string }) {
  await connection()
  const [squad, chantsRes] = await Promise.all([getSquadWithRatings(team.id, userId), getChants()])
  const top = squad
    .filter((p) => p.avg !== null && p.count > 0)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0]
  const song = chantsRes.chants[0]
  return (
    <div className="h2-split">
      <Link href="/stand/players" className="h2-mini" aria-label="דירוג השחקנים">
        <span className="h2-mini-head"><Star className="size-4 text-[color:var(--h2-gold)] fill-current" aria-hidden="true" />דירוג השחקנים</span>
        {top ? (
          <span className="h2-mini-row">
            <span className="h2-mini-num" aria-hidden="true">{top.number ?? '★'}</span>
            <span className="h2-mini-main">
              <b>{top.name_short || top.name_he}</b>
              <span className="h2-mini-rate"><Star className="size-3 fill-current" aria-hidden="true" />{(top.avg ?? 0).toFixed(1)}</span>
            </span>
          </span>
        ) : (
          <span className="h2-mini-empty">עוד לא דורגו שחקנים</span>
        )}
        <span className="h2-mini-cta">דרגו עכשיו</span>
      </Link>
      <Link href="/stand/chants" className="h2-mini" aria-label="חממת השירים">
        <span className="h2-mini-head"><Music className="size-4 text-[color:var(--brand2)]" aria-hidden="true" />חממת השירים</span>
        {song ? (
          <span className="h2-mini-row">
            <span className="h2-mini-play" aria-hidden="true"><Play className="size-4 fill-current" /></span>
            <span className="h2-mini-main">
              <b>{song.title}</b>
              <span className="h2-mini-sub">השיר המוביל כרגע</span>
            </span>
          </span>
        ) : (
          <span className="h2-mini-empty">עוד אין שירים</span>
        )}
        <span className="h2-mini-cta">להאזנה</span>
      </Link>
    </div>
  )
}

// ── 8. campaign teaser ──────────────────────────────────────────────────────────────
export async function CampaignTeaser() {
  await connection()
  const campaigns = await getLiveCampaigns(1)
  const c = campaigns[0]
  if (!c) return null
  const pct = progressPct(c.raised_agorot, c.goal_agorot)
  return (
    <section aria-label="הקמפיינים של הקהילה">
      <SectionHead title="הקמפיינים של הקהילה" icon={<Megaphone className="size-4 text-[color:var(--h2-gold)]" aria-hidden="true" />} />
      <Link href={`/campaigns/${c.id}` as Route} className="h2-camp">
        <div className="h2-camp-top">
          <b className="h2-camp-title">{c.title}</b>
          <span className="h2-camp-cta">תרמו עכשיו<ChevronLeft className="size-4" aria-hidden="true" /></span>
        </div>
        <div className="h2-camp-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="h2-camp-nums">
          <b>{moneyLabel(c.raised_agorot, c.currency)}</b>
          <span> מתוך {moneyLabel(c.goal_agorot, c.currency)}</span>
        </div>
      </Link>
    </section>
  )
}

// ── shared ──────────────────────────────────────────────────────────────────────────
function SectionHead({ title, icon, href, more }: { title: string; icon?: ReactNode; href?: Route; more?: string }) {
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
