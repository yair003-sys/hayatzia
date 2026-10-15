import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BanList } from '@/features/admin/components/ban-list'
import { ReportCard } from '@/features/admin/components/report-card'
import { QUEUE_STATUS, actionBy, actionLabel, kindLabel, queueStatus, reportTime, type QueueStatus } from '@/features/admin/schema'
import { getBans, getRecentActions, getReportQueue, isAppAdmin, type Cursor } from '@/features/admin/server/queries'

export const metadata: Metadata = { title: 'דיווחים', robots: { index: false, follow: false } }

// Moderation (owner, 2026-10-15): the operator removes reported illegal content fast. Admins only; everyone else
// gets a plain "not found" (the database refuses them anyway).
export default function Page({ searchParams }: PageProps<'/admin/reports'>) {
  return (
    <section className="space-y-5">
      <Suspense fallback={<QueueSkeleton />}>
        {searchParams.then((sp) => (
          <Admin status={queueStatus(sp.status)} cursor={cursorOf(sp.before, sp.id)} />
        ))}
      </Suspense>
    </section>
  )
}

function cursorOf(before: unknown, id: unknown): Cursor | null {
  if (typeof before !== 'string' || typeof id !== 'string') return null
  if (Number.isNaN(Date.parse(before)) || !/^[0-9a-f-]{36}$/.test(id)) return null
  return { before, beforeId: id }
}

async function Admin({ status, cursor }: { status: QueueStatus; cursor: Cursor | null }) {
  if (!(await isAppAdmin())) notFound()
  const [queue, bans, actions] = await Promise.all([getReportQueue(status, cursor), getBans(), getRecentActions()])

  return (
    <>
      <Link href="/me" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        הכרטיס שלי
      </Link>
      <h1 className="t-page">דיווחים</h1>

      <nav aria-label="סינון דיווחים" className="flex gap-2">
        {(Object.keys(QUEUE_STATUS) as QueueStatus[]).map((s) => (
          <Link
            key={s}
            href={{ pathname: '/admin/reports', query: { status: s } }}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line text-sm font-medium',
              s === status ? 'border-accent bg-accent-soft text-fg' : 'text-muted',
            )}
          >
            {QUEUE_STATUS[s]}
          </Link>
        ))}
      </nav>

      <h2 className="sr-only">{QUEUE_STATUS[status]}</h2>
      {queue.rows.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-muted">{status === 'open' ? 'אין דיווחים פתוחים.' : 'אין כאן דיווחים.'}</p>
      ) : (
        <ul className="space-y-3">
          {queue.rows.map((r) => (
            <li key={r.id}>
              <ReportCard r={r} />
            </li>
          ))}
        </ul>
      )}
      {queue.next && (
        <Link
          href={{ pathname: '/admin/reports', query: { status, before: queue.next.before, id: queue.next.beforeId } }}
          className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm"
        >
          דיווחים קודמים
        </Link>
      )}

      <section aria-labelledby="bans-title" className="space-y-2">
        <h2 id="bans-title" className="me-label">
          מושעים מכתיבה
        </h2>
        <BanList bans={bans} />
      </section>

      <section aria-labelledby="audit-title" className="space-y-2">
        <h2 id="audit-title" className="me-label">
          פעולות אחרונות
        </h2>
        {actions.length === 0 ? (
          <p className="text-sm text-muted">עוד אין פעולות.</p>
        ) : (
          <ul className="space-y-1 text-sm text-muted">
            {actions.map((a) => {
              const by = actionBy(a.action, a.admin_nick)
              return (
                <li key={a.id}>
                  <time dateTime={a.created_at} className="text-dim">
                    {reportTime(a.created_at)}
                  </time>{' '}
                  · {actionLabel(a.action)}
                  {a.kind ? ` · ${kindLabel(a.kind)}` : ''}
                  {a.target_nick ? ` · ${a.target_nick}` : ''}
                  {by ? ` (${by})` : ''}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

function QueueSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-11 rounded-xl" />
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  )
}
