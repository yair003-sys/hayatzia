import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Lock } from 'lucide-react'
import { InboxList } from '@/features/dm/components/inbox-list'
import { InboxLive } from '@/features/dm/components/inbox-live'
import { getInbox } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'הודעות' }

export default function Page() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="t-page">הודעות</h1>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5 text-ok" aria-hidden="true" />
          מוצפן מקצה לקצה
        </p>
      </header>
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden="true" />}>
        <Inbox />
      </Suspense>
    </section>
  )
}

async function Inbox() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">ההודעות פועלות רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const { rows, invites } = await getInbox(s.userId)
  return (
    <>
      <InboxLive meId={s.userId} />
      <InboxList meId={s.userId} rows={rows} invites={invites} />
    </>
  )
}
