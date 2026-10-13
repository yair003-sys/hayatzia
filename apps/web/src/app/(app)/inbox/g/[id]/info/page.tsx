import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { GroupInfo } from '@/features/dm/components/group-info'
import { getGroup } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'פרטי הקבוצה' }

export default function Page({ params }: PageProps<'/inbox/g/[id]/info'>) {
  return (
    <section className="space-y-3">
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        {params.then(({ id }) => (
          <Info id={id} />
        ))}
      </Suspense>
    </section>
  )
}

async function Info({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const g = await getGroup(id, s.userId)
  if (!g) notFound()
  return (
    <>
      <Link href={`/inbox/g/${g.id}`} className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        חזרה לשיחה
      </Link>
      <GroupInfo group={g} meId={s.userId} />
    </>
  )
}
