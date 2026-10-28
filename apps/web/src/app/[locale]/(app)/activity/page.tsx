import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Bell } from 'lucide-react'
import { LoadError } from '@/components/load-error'
import { ActivityFeed } from '@/features/activity/components/activity-feed'
import { getActivityPage } from '@/features/activity/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'התראות' }

export default function Page() {
  return (
    <section className="space-y-4">
      <h1 className="t-page">התראות</h1>
      <Suspense fallback={<ListSkeleton />}>
        <Activity />
      </Suspense>
    </section>
  )
}

async function Activity() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">ההתראות פועלות רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const page = await getActivityPage(s.userId)
  if (!page) return <LoadError />
  return (
    <ActivityFeed
      meId={s.userId}
      items={page.items}
      next={page.next}
      seenAt={page.seenAt}
      newestAt={page.newestAt}
      empty={
        <div className="act-empty">
          <span className="act-empty-ico" aria-hidden="true">
            <Bell className="size-6" strokeWidth={1.6} />
          </span>
          <p className="font-semibold">עוד אין התראות</p>
          <p className="text-sm text-muted">כאן יופיעו לייקים על הפוסטים שלך ובקשות להצטרף לנסיעות שלך.</p>
        </div>
      }
    />
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="skeleton h-16 rounded-xl" />
      <div className="skeleton h-16 rounded-xl" />
      <div className="skeleton h-16 rounded-xl" />
    </div>
  )
}
