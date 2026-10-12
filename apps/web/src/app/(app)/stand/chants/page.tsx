import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { ChantsBoard } from '@/features/stage4/components/chants-board'
import { getChants } from '@/features/stage4/server/queries'
import { BackToStand } from '@/features/team-life/components/back'

export const metadata: Metadata = { title: 'שירי היציע' }

export default function Page() {
  return (
    <section className="space-y-4">
      <BackToStand />
      <h1 className="font-display text-3xl font-black">🎶 שירי היציע</h1>
      <Suspense fallback={<div className="skeleton h-60 rounded-2xl" aria-hidden="true" />}>
        <Chants />
      </Suspense>
    </section>
  )
}

async function Chants() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const { chants, isRep } = await getChants()
  return (
    <>
      <p className="text-sm text-muted">השירים של {s.team.short}. רק אוהדי הקבוצה רואים אותם, ורק נציג הקהל מוסיף.</p>
      <ChantsBoard initial={chants} isRep={isRep} meId={s.userId} teamShort={s.team.short} />
    </>
  )
}
