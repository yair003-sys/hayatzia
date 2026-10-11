import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'

export const metadata: Metadata = { title: 'היציע שלי' }

export default function Page() {
  return (
    <section className="space-y-5">
      <Suspense fallback={<div className="skeleton h-24 rounded-lg" aria-hidden="true" />}>
        <StandHeader />
      </Suspense>
      <Link
        href="/stand/chat"
        className="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-gradient-to-b from-surface-2 to-surface p-4 transition-colors hover:border-line-strong"
      >
        <span className="flex items-center gap-2.5">
          <MessageCircle className="size-5 text-accent-text" aria-hidden="true" />
          <b className="font-display text-lg">צ׳אט הקבוצה</b>
          <span className="ms-auto rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">פתוח תמיד</span>
          <ChevronLeft className="size-4 text-dim" aria-hidden="true" />
        </span>
        <span className="text-sm text-muted">רק אוהדי הקבוצה שלך. בזמן אמת.</span>
      </Link>
      <p className="text-sm text-dim">בקרוב כאן: ההרכב, דירוג השחקנים, תמונות היציע ויום המשחק.</p>
    </section>
  )
}

async function StandHeader() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return <h1 className="font-display text-3xl font-black">היציע שלי</h1>
  }
  return (
    <header className="flex items-center gap-3">
      <TeamScarf team={s.team} className="h-10 w-3.5" />
      <div>
        <h1 className="font-display text-3xl font-black">{s.team.name}</h1>
        <p className="text-sm text-muted">שלום {s.nick}</p>
      </div>
    </header>
  )
}
