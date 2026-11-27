import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getLeague } from '@/features/matches/server/queries'
import { getFanCard, getMyPhotos } from '@/features/me/server/queries'
import {
  CommunityFeatures,
  HomeHeader,
  NextMatchCard,
  QuickActions,
  TrendingSquare,
  WallPreview,
} from '@/features/home/components/v2/sections'

export const metadata: Metadata = { title: { absolute: 'onefan' } }

// New home ("fan command centre", owner spec 2026-11-27). Previewed here at /stand/home2 while the production home at
// /stand stays untouched, so the owner reviews it before it is promoted. Everything is wired to the real systems.
export default function Page() {
  return (
    <div className="home2">
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
    </div>
  )
}

async function Home() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return <h1 className="t-page">onefan</h1>
  const league = await getLeague()
  const season = league?.league.season ?? null
  const [card, photos] = await Promise.all([getFanCard(s.userId, s.team.id, season), getMyPhotos(s.userId)])
  const { team } = s
  return (
    <>
      <HomeHeader team={team} nick={s.nick} avatarUrl={photos.avatarUrl} points={card?.points ?? 0} userId={s.userId} />
      <main className="h2-main">
        <Suspense fallback={<div className="skeleton h-56 rounded-[22px]" aria-hidden="true" />}>
          <NextMatchCard team={team} />
        </Suspense>
        <QuickActions />
        <Suspense fallback={<div className="skeleton h-40 rounded-2xl" aria-hidden="true" />}>
          <WallPreview clubShort={team.short} />
        </Suspense>
        <Suspense fallback={<div className="skeleton h-44 rounded-2xl" aria-hidden="true" />}>
          <TrendingSquare meId={s.userId} teamId={team.id} />
        </Suspense>
        <CommunityFeatures />
      </main>
    </>
  )
}

function HomeSkeleton() {
  return (
    <div className="h2-main pt-4" aria-hidden="true">
      <div className="skeleton h-14 rounded-2xl" />
      <div className="skeleton h-56 rounded-[22px]" />
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  )
}
