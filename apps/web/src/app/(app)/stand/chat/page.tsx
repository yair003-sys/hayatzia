import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { Suspense } from 'react'
import { BadgeCheck, ChevronLeft, ChevronRight, MoreVertical, ShieldCheck } from 'lucide-react'
import { TeamChat } from '@/features/team-chat/components/team-chat'
import { getTeamMessages, getTeamMemberCount } from '@/features/team-chat/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { LoadError } from '@/components/load-error'
import { NewsFeed } from '@/features/team-news/components/news-feed'
import { PinnedPost } from '@/features/team-news/components/pinned-post'
import { shortCount } from '@/features/square/schema'
import { amIChannelAdmin, getLatestPost, getTeamNews } from '@/features/team-news/server/queries'

export const metadata: Metadata = { title: 'צ׳אט הקבוצה' }

export default function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <div className="teamchat">
      <Suspense fallback={<ChatSkeleton />}>
        <ChatScreen searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function ChatScreen({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const showNews = sp?.tab === 'news'
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="p-4 text-muted">הצ׳אט פועל רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <ChatSkeleton />

  // The channel ("news") lives behind the ⋮ menu now, so the chat view is a clean group chat like the mockup.
  if (showNews) {
    const [news, isAdmin] = await Promise.all([getTeamNews(), amIChannelAdmin()])
    return (
      <>
        <header className="tc-head">
          <Link href="/stand/chat" className="tc-icon" aria-label="חזרה לצ׳אט">
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
          <div className="tc-id">
            <b>ערוץ {s.team.short}</b>
            <span>הודעות רשמיות מההנהלה</span>
          </div>
        </header>
        <div className="tc-body">
          <NewsFeed teamId={s.team.id} meId={s.userId} isAdmin={isAdmin} initial={news ?? []} />
        </div>
      </>
    )
  }

  const [initial, hidden, latest, members] = await Promise.all([
    getTeamMessages(),
    getBlockedIdsOrNull(),
    getLatestPost(),
    getTeamMemberCount(),
  ])

  return (
    <>
      <header className="tc-head">
        <Link href="/stand" className="tc-icon" aria-label="חזרה">
          <ChevronLeft className="size-5 -scale-x-100" aria-hidden="true" />
        </Link>
        <span className="tc-crest" aria-hidden="true">
          <TeamScarf team={s.team} className="size-9 rounded-full" />
        </span>
        <div className="tc-id">
          <b>
            אוהדי {s.team.short}
            <BadgeCheck className="size-4 text-[color:var(--tc-brand2)]" aria-label="רשמי" />
          </b>
          <span>{members > 0 ? `${shortCount(members)} חברים` : `רק אוהדי ${s.team.short}`}</span>
        </div>
        <Link href={'/stand/chat?tab=news' as Route} className="tc-icon" aria-label="ערוץ רשמי">
          <MoreVertical className="size-5" aria-hidden="true" />
        </Link>
      </header>

      <div className="tc-official-row">
        <span className="tc-official-pill">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          קבוצה רשמית
        </span>
      </div>

      {initial && hidden ? (
        <div className="tc-body">
          {latest && (
            <div className="tc-pinned">
              <PinnedPost post={latest} />
            </div>
          )}
          <TeamChat teamId={s.team.id} meId={s.userId} initial={initial} hidden={hidden} color={s.team.bg} clubName={s.team.name} />
        </div>
      ) : (
        <LoadError />
      )}
    </>
  )
}

function ChatSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden="true">
      <div className="skeleton h-10 w-1/2 rounded-md" />
      <div className="skeleton h-14 w-3/4 rounded-lg" />
      <div className="skeleton ms-auto h-14 w-2/3 rounded-lg" />
      <div className="skeleton h-14 w-3/4 rounded-lg" />
    </div>
  )
}
