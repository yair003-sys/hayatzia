import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight, ShieldCheck, BadgeCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContentRow } from '@/features/admin/components/content-row'
import { WallSuspend } from '@/features/admin/components/wall-suspend'
import { CONTENT_KIND, contentKind, joinedLabel, type ContentKind } from '@/features/admin/schema'
import { getUserContent, getUserDetail, isAppAdmin, type Cursor, type UserDetailRow } from '@/features/admin/server/queries'

export const metadata: Metadata = { title: 'קיר אוהד · אדמין', robots: { index: false, follow: false } }

type Param = string | string[] | undefined

export default function Page({ params, searchParams }: PageProps<'/admin/users/[id]'>) {
  return (
    <section className="space-y-5">
      <Suspense fallback={<Skeleton />}>
        {Promise.all([params, searchParams]).then(([p, sp]) => <Screen id={p.id} kind={sp.kind} before={sp.before} id2={sp.id} />)}
      </Suspense>
    </section>
  )
}

function cursorOf(before: Param, id: Param): Cursor | null {
  if (typeof before !== 'string' || typeof id !== 'string') return null
  if (Number.isNaN(Date.parse(before))) return null
  return { before, beforeId: id }
}

const COUNT_OF: Record<ContentKind, (d: UserDetailRow) => number> = {
  clip: (d) => d.clips,
  trip: (d) => d.trips,
  channel_post: (d) => d.channel_posts,
  review: (d) => d.reviews,
}

async function Screen({ id, kind: kindParam, before, id2 }: { id: string; kind: Param; before: Param; id2: Param }) {
  if (!(await isAppAdmin())) notFound()
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const detail = await getUserDetail(id)
  if (!detail) notFound()
  const kind = contentKind(kindParam)
  const { rows, next } = await getUserContent(id, kind, cursorOf(before, id2))

  return (
    <>
      <Link href="/admin/users" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        משתמשים
      </Link>

      <header className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold">
              {detail.nick}
              {detail.is_admin && <ShieldCheck className="size-5 shrink-0 text-accent" aria-label="מנהל" />}
              {detail.verified && <BadgeCheck className="size-5 shrink-0 text-muted" aria-label="מאומת 18+" />}
            </h1>
            <p className="text-sm text-dim">
              {detail.team_name} · נרשם {joinedLabel(detail.created_at)}
            </p>
          </div>
          <WallSuspend userId={detail.user_id} banned={detail.banned} banUntil={detail.ban_until} isAdmin={detail.is_admin} />
        </div>

        <dl className="grid grid-cols-4 gap-2 text-center">
          {(Object.keys(CONTENT_KIND) as ContentKind[]).map((k) => (
            <div key={k} className="rounded-xl bg-canvas p-2">
              <dt className="t-num text-lg font-bold">{COUNT_OF[k](detail)}</dt>
              <dd className="text-[11px] text-dim">{CONTENT_KIND[k]}</dd>
            </div>
          ))}
        </dl>
      </header>

      <nav aria-label="סוג תוכן" className="flex flex-wrap gap-2">
        {(Object.keys(CONTENT_KIND) as ContentKind[]).map((k) => (
          <Link
            key={k}
            href={`/admin/users/${id}?kind=${k}` as Route}
            aria-current={k === kind ? 'page' : undefined}
            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm', k === kind ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted')}
          >
            {CONTENT_KIND[k]}
            <span className="t-num text-dim">{COUNT_OF[k](detail)}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-muted">אין כאן תוכן של האוהד הזה.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.map((c) => (
            <ContentRow key={`${c.kind}:${c.ref}`} c={c} />
          ))}
        </ul>
      )}

      {next && (
        <Link
          href={`/admin/users/${id}?kind=${kind}&before=${encodeURIComponent(next.before)}&id=${encodeURIComponent(next.beforeId)}` as Route}
          className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm"
        >
          תוכן קודם
        </Link>
      )}
    </>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-28 rounded-2xl" />
      <div className="skeleton h-11 rounded-xl" />
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  )
}
