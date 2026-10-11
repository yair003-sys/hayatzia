import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { SquareFeed } from '@/features/square/components/square-feed'
import { UploadClip } from '@/features/square/components/upload-clip'
import { getSquareFeed } from '@/features/square/server/queries'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'הכיכר' }

export default function Page({ searchParams }: PageProps<'/square'>) {
  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-black">הכיכר</h1>
        <span className="text-xs text-muted">כל פוסט נעלם אחרי 24 שעות</span>
      </header>
      <Suspense fallback={<FeedSkeleton />}>
        {searchParams.then((sp) => (
          <SquareScreen mine={sp.f === 'mine'} />
        ))}
      </Suspense>
    </section>
  )
}

async function SquareScreen({ mine }: { mine: boolean }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="text-muted">הכיכר פועלת רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <FeedSkeleton />
  const clips = await getSquareFeed({ mine })
  return (
    <>
      <UploadClip meId={s.userId} />
      <nav className="flex gap-2 text-sm" aria-label="סינון">
        <Link
          href="/square"
          aria-current={!mine ? 'page' : undefined}
          className={cn('rounded-full border px-3 py-1', !mine ? 'border-accent bg-accent-soft' : 'border-line text-muted')}
        >
          כל הליגה
        </Link>
        <Link
          href="/square?f=mine"
          aria-current={mine ? 'page' : undefined}
          className={cn('rounded-full border px-3 py-1', mine ? 'border-accent bg-accent-soft' : 'border-line text-muted')}
        >
          {s.team.short}
        </Link>
      </nav>
      <SquareFeed key={`${mine ? 'mine' : 'all'}:${clips[0]?.id ?? ''}`} initial={clips} meId={s.userId} myTeamId={s.team.id} mine={mine} />
    </>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-12 rounded-lg" />
      <div className="skeleton aspect-[4/5] rounded-lg" />
    </div>
  )
}
