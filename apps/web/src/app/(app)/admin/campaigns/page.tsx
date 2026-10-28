import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { features } from '@/lib/flags'
import { isAppAdmin } from '@/features/admin/server/queries'
import { PublishButton, ReleaseForm, SettleButton, VendorApproveButton } from '@/features/campaigns/components/admin-controls'
import { VENDOR_CATEGORY_HE, type VendorCategory, moneyLabel } from '@/features/campaigns/schema'
import { getCampaignsByStatus, getPendingVendors } from '@/features/campaigns/server/queries'

export const metadata: Metadata = { title: 'ניהול קמפיינים', robots: { index: false, follow: false } }

export default function Page() {
  if (!features.campaigns) notFound()
  return (
    <section className="space-y-6">
      <h1 className="t-page">ניהול קמפיינים</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        <Admin />
      </Suspense>
    </section>
  )
}

async function Admin() {
  if (!(await isAppAdmin())) notFound()
  const [vendors, review, live, awaiting] = await Promise.all([
    getPendingVendors(),
    getCampaignsByStatus('pending_review'),
    getCampaignsByStatus('live'),
    getCampaignsByStatus('awaiting_invoice'),
  ])

  const row = 'flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3'
  const empty = 'rounded-2xl border border-line bg-surface p-3 text-sm text-muted'
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="me-label">ספקים לאישור</h2>
        {vendors.length === 0 ? (
          <p className={empty}>אין ספקים שממתינים לאישור.</p>
        ) : (
          vendors.map((v) => (
            <div key={v.id} className={row}>
              <span>
                <b>{v.name}</b> · <span className="text-muted">{VENDOR_CATEGORY_HE[v.category as VendorCategory] ?? v.category}</span>{' '}
                <span className="text-dim">ח״פ {v.business_id}</span>
              </span>
              <VendorApproveButton vendorId={v.id} />
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="me-label">קמפיינים לפרסום</h2>
        {review.length === 0 ? (
          <p className={empty}>אין קמפיינים שממתינים לפרסום.</p>
        ) : (
          review.map((c) => (
            <div key={c.id} className={row}>
              <span>
                <b>{c.title}</b> · <span className="text-muted">יעד {moneyLabel(c.goal_agorot, c.currency)}</span>
              </span>
              <PublishButton campaignId={c.id} />
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="me-label">קמפיינים פעילים (לסגירה בתום המועד)</h2>
        {live.length === 0 ? (
          <p className={empty}>אין קמפיינים פעילים.</p>
        ) : (
          live.map((c) => (
            <div key={c.id} className={row}>
              <span>
                <b>{c.title}</b> · <span className="text-muted">{moneyLabel(c.raised_agorot, c.currency)} / {moneyLabel(c.goal_agorot, c.currency)}</span>
              </span>
              <SettleButton campaignId={c.id} />
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="me-label">ממתינים לחשבונית ושחרור לספק</h2>
        {awaiting.length === 0 ? (
          <p className={empty}>אין קמפיינים שממתינים לשחרור.</p>
        ) : (
          awaiting.map((c) => (
            <div key={c.id} className="space-y-2 rounded-2xl border border-line bg-surface p-3">
              <span>
                <b>{c.title}</b> · <span className="text-muted">נאסף {moneyLabel(c.raised_agorot, c.currency)}</span>
              </span>
              <ReleaseForm campaignId={c.id} />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
