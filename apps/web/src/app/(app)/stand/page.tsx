import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LiveNow, MatchNightHero } from '@/features/home/components/sections'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getChannelUnread, getTeamNews } from '@/features/team-news/server/queries'
import { WallFeed } from '@/features/wall/components/wall-feed'

export const metadata: Metadata = { title: { absolute: 'onefan' } }

// The home is the wall — the club's X-style feed (redesign phase 3). The live/next match is pinned at the very top
// (restored 2026-11-13, owner), so a fan sees the match first; the rest of the dashboard lives at /stand/hub.
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
  const [news, unread] = await Promise.all([getTeamNews(), getChannelUnread()])
  const { team } = s
  // Live match leads when one is on; otherwise the next fixture. Each returns null when there's nothing, so the
  // anchor simply vanishes on a quiet day and the feed sits at the top.
  const matchSlot = (
    <>
      <Suspense fallback={null}>
        <LiveNow team={team} />
      </Suspense>
      <Suspense fallback={null}>
        <MatchNightHero team={team} />
      </Suspense>
    </>
  )
  return (
    <WallFeed
      teamId={team.id}
      meId={s.userId}
      clubName={team.name}
      clubShort={team.short}
      initial={news ?? []}
      unread={unread}
      matchSlot={matchSlot}
    />
  )
}
