import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BellOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '@/features/dm/components/avatar'
import { GroupThread } from '@/features/dm/components/group-thread'
import { membersLabel } from '@/features/dm/schema'
import { getGroup } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'קבוצה' }

export default function Page({ params }: PageProps<'/inbox/g/[id]'>) {
  return (
    <section className="space-y-3">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        כל השיחות
      </Link>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        {params.then(({ id }) => (
          <Group id={id} />
        ))}
      </Suspense>
    </section>
  )
}

async function Group({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const g = await getGroup(id, s.userId)
  if (!g) return <NotMember />
  const nicks = Object.fromEntries(g.members.map((m) => [m.userId, m.nick]))
  return (
    <>
      <header>
        <Link href={`/inbox/g/${g.id}/info`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-surface">
          <Avatar id={g.id} name={g.name} group />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="t-page truncate">{g.name}</h1>
              {g.muted && <BellOff className="size-4 shrink-0 text-dim" aria-label="מושתק" />}
            </div>
            <p className="text-xs text-muted">{membersLabel(g.members.length)}</p>
          </div>
          <ChevronLeft className="size-5 shrink-0 text-dim" aria-hidden="true" />
          <span className="sr-only">פרטי הקבוצה</span>
        </Link>
      </header>
      <GroupThread key={g.id} groupId={g.id} meId={s.userId} nicks={nicks} />
    </>
  )
}

function NotMember() {
  return (
    <div className="space-y-2 py-10 text-center">
      <p className="t-sec">אתה לא חבר בקבוצה הזאת</p>
      <p className="text-sm text-muted">אם הזמינו אותך, ההזמנה מחכה ברשימת ההודעות.</p>
      <Link href="/inbox" className="text-sm text-accent-text">
        לרשימת ההודעות
      </Link>
    </div>
  )
}
