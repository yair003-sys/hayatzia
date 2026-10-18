import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BackToStand } from '@/features/team-life/components/back'
import { EventsBoard } from '@/features/team-life/components/boards'
import { getUpcomingEvents } from '@/features/team-life/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { LoadError } from '@/components/load-error'
import { notFound } from 'next/navigation'
import { features } from '@/lib/flags'

export const metadata: Metadata = { title: 'אירועים' }

export default function Page() {
  if (!features.events) notFound()
  return (
    <section className="space-y-4">
      <BackToStand />
      <h1 className="t-page">אירועים</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Events />
      </Suspense>
    </section>
  )
}

async function Events() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const events = await getUpcomingEvents()
  if (!events) return <LoadError />
  return <EventsBoard key={events.map((e) => e.id).join()} events={events} meId={s.userId} />
}
