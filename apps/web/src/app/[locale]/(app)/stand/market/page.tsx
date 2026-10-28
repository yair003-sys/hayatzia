import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BackToStand } from '@/features/team-life/components/back'
import { MarketBoard } from '@/features/team-life/components/boards'
import { MARKET_CAT } from '@/features/team-life/schema'
import { getMarket } from '@/features/team-life/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { cn } from '@/lib/utils'
import { LoadError } from '@/components/load-error'
import { notFound } from 'next/navigation'
import { features } from '@/lib/flags'

export const metadata: Metadata = { title: 'שוק אוהדים' }

export default function Page({ searchParams }: PageProps<'/stand/market'>) {
  if (!features.market) notFound()
  return (
    <section className="space-y-4">
      <BackToStand />
      <h1 className="t-page">שוק אוהדים</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        {searchParams.then((sp) => (
          <Market cat={typeof sp.c === 'string' && sp.c in MARKET_CAT ? sp.c : undefined} />
        ))}
      </Suspense>
    </section>
  )
}

async function Market({ cat }: { cat?: string }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const items = await getMarket(cat)
  return (
    <>
      <nav aria-label="קטגוריות" className="flex gap-2 overflow-x-auto pb-1 text-sm">
        {[['', 'הכול'] as const, ...Object.entries(MARKET_CAT)].map(([k, v]) => (
          <Link
            key={k}
            href={k ? `/stand/market?c=${k}` : '/stand/market'}
            aria-current={(cat ?? '') === k ? 'page' : undefined}
            className={cn('shrink-0 rounded-full border px-3 py-1', (cat ?? '') === k ? 'border-accent bg-accent-soft' : 'border-line text-muted')}
          >
            {v}
          </Link>
        ))}
      </nav>
      {items ? <MarketBoard items={items} meId={s.userId} teamShort={s.team.short} /> : <LoadError />}
    </>
  )
}
