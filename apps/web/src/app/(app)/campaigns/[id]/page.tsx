import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { features } from '@/lib/flags'
import { ContributeBox } from '@/features/campaigns/components/contribute-box'
import { CATEGORY_HE, type Category, STATUS_HE, type Status, daysLeft, moneyLabel, progressPct } from '@/features/campaigns/schema'
import { getCampaign } from '@/features/campaigns/server/queries'

const clock = () => Date.now()

export default function CampaignPage({ params }: PageProps<'/campaigns/[id]'>) {
  if (!features.campaigns) notFound()
  return (
    <section className="space-y-4">
      <Link href="/campaigns" className="text-sm text-accent-text">
        → כל הקמפיינים
      </Link>
      <Suspense fallback={<div className="skeleton h-80 rounded-lg" aria-hidden="true" />}>
        {params.then(({ id }) => (
          <Detail id={id} />
        ))}
      </Suspense>
    </section>
  )
}

async function Detail({ id }: { id: string }) {
  const c = await getCampaign(id)
  if (!c) notFound()
  const pct = progressPct(c.raised_agorot, c.goal_agorot)
  const left = daysLeft(new Date(c.deadline).getTime(), clock())
  const live = c.status === 'live'
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-muted">
          {CATEGORY_HE[c.category as Category] ?? 'אחר'}
        </span>
        {c.beneficiary_verified && <span className="text-[11px] font-extrabold text-ok">✔ מאומת</span>}
        {!live && <span className="text-[11px] font-bold text-muted">· {STATUS_HE[c.status as Status] ?? c.status}</span>}
      </div>

      <div>
        <h1 className="text-2xl font-black leading-tight">{c.title}</h1>
        <p className="mt-2 text-[13px] text-muted">למען: <b className="text-fg">{c.beneficiary_name}</b></p>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-black">
            {moneyLabel(c.raised_agorot, c.currency)}{' '}
            <span className="text-[13px] font-bold text-muted">מתוך {moneyLabel(c.goal_agorot, c.currency)}</span>
          </span>
          <span className="text-[13px] font-extrabold text-accent-text">{pct}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
          <i className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex gap-6 text-[12px] text-muted">
          <span>
            <b className="block text-base text-fg">{c.supporters_count.toLocaleString('he-IL')}</b> תומכים
          </span>
          <span>
            <b className="block text-base text-fg">{left}</b> ימים נותרו
          </span>
        </div>
      </div>

      {c.description && <p className="whitespace-pre-line text-[14px] leading-relaxed text-fg/90">{c.description}</p>}

      {live ? (
        <ContributeBox campaignId={c.id} currency={c.currency} />
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          הקמפיין {STATUS_HE[c.status as Status] ?? c.status}. אפשר לתרום רק כשהוא פעיל.
        </p>
      )}
    </div>
  )
}
