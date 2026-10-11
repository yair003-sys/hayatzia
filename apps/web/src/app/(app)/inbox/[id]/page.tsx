import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { DmThread } from '@/features/dm/components/dm-thread'
import { getThread } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { ReportBlock } from '@/features/safety/components/report-block'

export const metadata: Metadata = { title: 'שיחה פרטית' }

export default function Page({ params }: PageProps<'/inbox/[id]'>) {
  return (
    <section className="space-y-3">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        כל השיחות
      </Link>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        {params.then(({ id }) => (
          <Thread id={id} />
        ))}
      </Suspense>
    </section>
  )
}

async function Thread({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const t = await getThread(id, s.userId)
  if (!t) notFound()
  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-black">{t.otherNick}</h1>
        <ReportBlock kind="dm_thread" refId={t.id} userId={t.otherId} userNick={t.otherNick} />
      </header>
      <DmThread threadId={t.id} meId={s.userId} otherId={t.otherId} otherNick={t.otherNick} />
    </>
  )
}
