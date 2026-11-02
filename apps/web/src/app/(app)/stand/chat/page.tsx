import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { TeamChat } from '@/features/team-chat/components/team-chat'
import { getTeamMessages } from '@/features/team-chat/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { LoadError } from '@/components/load-error'
import { NewsTabs } from '@/features/team-news/components/news-tabs'
import { NewsFeed } from '@/features/team-news/components/news-feed'
import { PinnedPost } from '@/features/team-news/components/pinned-post'
import { amIChannelAdmin, getChannelUnread, getLatestPost, getTeamNews } from '@/features/team-news/server/queries'

export const metadata: Metadata = { title: 'צ׳אט הקבוצה' }

export default function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <section>
      <Link href="/stand" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        onefan
      </Link>
      <Suspense fallback={<ChatSkeleton />}>
        <ChatScreen searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function ChatScreen({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const initialTab = sp?.tab === 'news' ? 'news' : 'chat'
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="text-muted">הצ׳אט פועל רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <ChatSkeleton />
  const [initial, hidden, news, latest, unread, isAdmin] = await Promise.all([
    getTeamMessages(),
    getBlockedIdsOrNull(),
    getTeamNews(),
    getLatestPost(),
    getChannelUnread(),
    amIChannelAdmin(),
  ])
  const chatPanel =
    initial && hidden ? (
      <>
        {latest && <PinnedPost post={latest} />}
        <TeamChat teamId={s.team.id} meId={s.userId} initial={initial} hidden={hidden} color={s.team.bg} clubName={s.team.name} />
      </>
    ) : (
      <LoadError />
    )
  const newsPanel = <NewsFeed teamId={s.team.id} meId={s.userId} isAdmin={isAdmin} initial={news ?? []} />
  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <TeamScarf team={s.team} className="h-8 w-3" />
        <div>
          <h1 className="t-page">צ׳אט {s.team.short}</h1>
          <p className="text-xs text-muted">רק אוהדי {s.team.short} רואים את הצ׳אט הזה</p>
        </div>
      </header>
      <NewsTabs initialTab={initialTab} chat={chatPanel} news={newsPanel} unread={unread} />
    </>
  )
}

function ChatSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-10 w-1/2 rounded-md" />
      <div className="skeleton h-14 w-3/4 rounded-lg" />
      <div className="skeleton ms-auto h-14 w-2/3 rounded-lg" />
      <div className="skeleton h-14 w-3/4 rounded-lg" />
    </div>
  )
}
