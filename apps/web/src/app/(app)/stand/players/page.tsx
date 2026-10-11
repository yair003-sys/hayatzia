import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { SquadRatings } from '@/features/ratings/components/squad-ratings'
import { getSquadWithRatings } from '@/features/ratings/server/queries'

export const metadata: Metadata = { title: 'דירוג שחקנים' }

export default function Page() {
  return (
    <section className="space-y-4">
      <Link href="/stand" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        היציע שלי
      </Link>
      <h1 className="font-display text-3xl font-black">דירוג שחקנים</h1>
      <p className="text-sm text-muted">הדירוגים והביקורות נשארים בתוך הקבוצה. אפשר לשנות דירוג מתי שרוצים.</p>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Squad />
      </Suspense>
    </section>
  )
}

async function Squad() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">הדירוג פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  return <SquadRatings initial={await getSquadWithRatings(s.team.id, s.userId)} />
}
