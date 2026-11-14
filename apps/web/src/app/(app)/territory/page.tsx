import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { getTerritory } from '@/features/territory/server/queries'
import { TerritoryMap } from '@/features/territory/components/territory-map'

export const metadata: Metadata = { title: 'מלחמת שכונות' }

export default function Page() {
  return (
    <section className="space-y-3">
      <Link href="/stand" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        חזרה
      </Link>
      <div className="space-y-1">
        <h1 className="t-page">מלחמת שכונות</h1>
        <p className="text-sm text-muted">כבשו את השכונה שלכם: הגיעו פיזית וצבעו אותה בצבעי הקבוצה. אזור שנכבש נעול לשעה.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-[62vh] rounded-2xl" aria-hidden="true" />}>
        <Board />
      </Suspense>
    </section>
  )
}

async function Board() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">מלחמת שכונות פועלת רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const cells = await getTerritory()
  return <TerritoryMap initial={cells} myTeamId={s.team.id} />
}
