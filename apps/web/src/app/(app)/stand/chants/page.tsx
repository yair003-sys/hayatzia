import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { ChantsBoard } from '@/features/stage4/components/chants-board'
import { getChants } from '@/features/stage4/server/queries'
import { BackToStand } from '@/features/team-life/components/back'
import { ChantsTabs } from '@/features/songs/components/chants-tabs'
import { SongsFeed } from '@/features/songs/components/songs-feed'
import { getSongs } from '@/features/songs/server/queries'

export const metadata: Metadata = { title: 'שירי הקהל' }

export default function Page() {
  return (
    <section className="space-y-4">
      <BackToStand />
      <h1 className="t-page">שירי הקהל</h1>
      <Suspense fallback={<div className="skeleton h-60 rounded-2xl" aria-hidden="true" />}>
        <Chants />
      </Suspense>
    </section>
  )
}

async function Chants() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const [{ chants, isRep }, songs] = await Promise.all([getChants(), getSongs()])
  return (
    <ChantsTabs
      teamSongs={
        <div className="space-y-3">
          <p className="text-sm text-muted">השירים הרשמיים של {s.team.short}. רק נציג הקהל מוסיף.</p>
          <ChantsBoard initial={chants} isRep={isRep} meId={s.userId} teamShort={s.team.short} />
        </div>
      }
      greenhouse={<SongsFeed initial={songs} meId={s.userId} teamShort={s.team.short} />}
    />
  )
}
