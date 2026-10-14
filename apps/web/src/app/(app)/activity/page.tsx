import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Bell } from 'lucide-react'
import { ActivityLive } from '@/features/activity/components/activity-live'
import { ActivityRows } from '@/features/activity/components/activity-rows'
import { LoadMore } from '@/features/activity/components/load-more'
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
  const newest = page.items[0]
  return (
    <>
      <ActivityLive meId={s.userId} stamp={newest ? `${newest.id}:${newest.updatedAt}` : ''} />
      {page.items.length === 0 ? (
        <div className="act-empty">
          <span className="act-empty-ico" aria-hidden="true">
            <Bell className="size-6" strokeWidth={1.6} />
          </span>
          <p className="font-semibold">עוד אין התראות</p>
          <p className="text-sm text-muted">כאן יופיעו לייקים על הפוסטים שלך ובקשות להצטרף לנסיעות שלך.</p>
        </div>
      ) : (
        <>
          <ActivityRows items={page.items} />
          {page.next && <LoadMore key={page.next} cursor={page.next} seenAt={page.seenAt} />}
        </>
      )}
    </>
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
