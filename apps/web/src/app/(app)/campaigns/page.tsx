import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { features } from '@/lib/flags'
import { CampaignCard } from '@/features/campaigns/components/campaign-card'
import { getLiveCampaigns } from '@/features/campaigns/server/queries'

export const metadata: Metadata = { title: 'קמפיינים' }

export default function CampaignsPage() {
  if (!features.campaigns) notFound()
  return (
    <section className="space-y-4">
      <Link href="/stand" className="text-sm text-accent-text">
        → היציע
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="t-page">קמפיינים</h1>
          <p className="mt-1 text-[13px] text-muted">מטרה אחת, קהילה שלמה. במקום לאסוף מזומן — משתתפים בבטחה.</p>
        </div>
        <Link href="/campaigns/new" className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-extrabold text-white">
          ＋ פתחו
        </Link>
      </div>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <List />
      </Suspense>
    </section>
  )
}

async function List() {
  const campaigns = await getLiveCampaigns()
  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
        עוד אין קמפיינים פעילים. רוצים להיות הראשונים?{' '}
        <Link href="/campaigns/new" className="font-bold text-accent-text">
          פתחו קמפיין
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </div>
  )
}
