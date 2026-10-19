import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { features } from '@/lib/flags'
import { CreateForm } from '@/features/campaigns/components/create-form'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'פתיחת קמפיין' }

export default function NewCampaignPage() {
  if (!features.campaigns) notFound()
  return (
    <section className="space-y-4">
      <Link href="/campaigns" className="text-sm text-accent-text">
        → כל הקמפיינים
      </Link>
      <h1 className="t-page">פתיחת קמפיין</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Gate />
      </Suspense>
    </section>
  )
}

async function Gate() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') {
    return (
      <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        צריך להתחבר כדי לפתוח קמפיין.{' '}
        <Link href="/login" className="font-bold text-accent-text">
          התחברות
        </Link>
      </p>
    )
  }
  return <CreateForm />
}
