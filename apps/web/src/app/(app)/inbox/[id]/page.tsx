import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { Avatar } from '@/features/dm/components/avatar'
import { DmThread } from '@/features/dm/components/dm-thread'
import { getThread } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { ReportBlock } from '@/features/safety/components/report-block'
import { teamById } from '@/features/teams/data'

export const metadata: Metadata = { title: 'שיחה פרטית' }

export default function Page({ params, searchParams }: PageProps<'/inbox/[id]'>) {
  return (
    <section className="space-y-3">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        כל השיחות
      </Link>
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
        {Promise.all([params, searchParams]).then(([{ id }, sp]) => {
          const clip = typeof sp.clip === 'string' && /^[0-9a-f-]{36}$/.test(sp.clip) ? sp.clip : undefined
          return <Thread id={id} shareClip={clip} />
        })}
      </Suspense>
    </section>
  )
}

async function Thread({ id, shareClip }: { id: string; shareClip?: string }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const t = await getThread(id, s.userId)
  if (!t) notFound()
  const club = t.otherTeam ? teamById(t.otherTeam) : undefined
  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <Link href={`/fans/${t.otherId}`} className="flex min-w-0 items-center gap-3" aria-label={`צפייה בפרופיל של ${t.otherNick}`}>
          <Avatar id={t.otherId} name={t.otherNick} />
          <div className="min-w-0">
            <h1 className="t-page truncate">{t.otherNick}</h1>
            {club && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2.5 rounded-full" style={{ background: club.bar }} aria-hidden="true" />
                {club.name}
              </p>
            )}
          </div>
        </Link>
        {/* A request offers block only (owner, 2026-10-16: no report of message content); an accepted chat keeps both. */}
        {t.request !== 'incoming' && <ReportBlock kind="dm_thread" refId={t.id} userId={t.otherId} userNick={t.otherNick} />}
      </header>
      <DmThread threadId={t.id} meId={s.userId} otherId={t.otherId} otherNick={t.otherNick} request={t.request} shareClip={shareClip} />
    </>
  )
}
