import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { VerifyPanel } from '@/features/verification/components/verify-panel'
import { getMyVerification } from '@/features/verification/server/queries'
import { notFound } from 'next/navigation'
import { features } from '@/lib/flags'

export const metadata: Metadata = { title: 'אימות לנסיעות', robots: { index: false, follow: false } }

export default function Page() {
  if (!features.rides) notFound()
  return (
    <section className="space-y-4">
      <Link href="/me" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        הכרטיס שלי
      </Link>
      <h1 className="t-page">אימות לנסיעות</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Verify />
      </Suspense>
    </section>
  )
}

async function Verify() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return <p className="text-muted">צריך להתחבר כדי לאמת.</p>
  const v = await getMyVerification()
  if (!v) return <p className="text-muted">לא הצלחנו לטעון את מצב האימות. נסה שוב.</p>
  return <VerifyPanel v={v} />
}
