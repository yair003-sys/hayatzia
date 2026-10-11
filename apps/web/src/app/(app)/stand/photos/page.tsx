import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { StandPhotos } from '@/features/stand-photos/components/stand-photos'
import { getStandPhotos } from '@/features/stand-photos/server/queries'

export const metadata: Metadata = { title: 'תמונות מהיציע' }

export default function Page() {
  return (
    <section className="space-y-4">
      <Link href="/stand" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        היציע שלי
      </Link>
      <h1 className="font-display text-3xl font-black">תמונות מהיציע</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Photos />
      </Suspense>
    </section>
  )
}

async function Photos() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">התמונות פועלות רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const photos = await getStandPhotos()
  return <StandPhotos key={photos[0]?.id ?? 'empty'} initial={photos} meId={s.userId} teamShort={s.team.short} />
}
