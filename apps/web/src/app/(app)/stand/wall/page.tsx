import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { amIChannelAdmin, getChannelUnread, getTeamNews } from '@/features/team-news/server/queries'
import { WallFeed } from '@/features/wall/components/wall-feed'

export const metadata: Metadata = { title: { absolute: 'onefan' } }

export default function Page() {
  return (
    <Suspense fallback={<WallSkeleton />}>
      <Wall />
    </Suspense>
  )
}

function WallSkeleton() {
  return (
    <div className="wl" aria-hidden="true">
      <div className="wl-in space-y-3 pt-2">
        <div className="skeleton h-12 rounded-2xl" />
        <div className="skeleton h-16 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    </div>
  )
}

async function Wall() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return <h1 className="t-page">onefan</h1>
  const [news, unread, canPost] = await Promise.all([getTeamNews(), getChannelUnread(), amIChannelAdmin()])
  return (
    <WallFeed
      teamId={s.team.id}
      meId={s.userId}
      isAdmin={canPost}
      clubName={s.team.name}
      clubShort={s.team.short}
      initial={news ?? []}
      unread={unread}
    />
  )
}
