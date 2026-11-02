import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContentRow } from '@/features/admin/components/content-row'
import { CONTENT_KIND, contentKind, type ContentKind } from '@/features/admin/schema'
import { getContentFeed, isAppAdmin, type Cursor } from '@/features/admin/server/queries'

export const metadata: Metadata = { title: 'תוכן · אדמין', robots: { index: false, follow: false } }

type Param = string | string[] | undefined

export default function Page({ searchParams }: PageProps<'/admin/content'>) {
  return (
    <section className="space-y-5">
      <Suspense fallback={<Skeleton />}>{searchParams.then((sp) => <Screen kind={sp.kind} before={sp.before} id={sp.id} />)}</Suspense>
    </section>
  )
}

function cursorOf(before: Param, id: Param): Cursor | null {
  if (typeof before !== 'string' || typeof id !== 'string') return null
  if (Number.isNaN(Date.parse(before))) return null
  return { before, beforeId: id }
}

async function Screen({ kind: kindParam, before, id }: { kind: Param; before: Param; id: Param }) {
  if (!(await isAppAdmin())) notFound()
  const kind = contentKind(kindParam)
  const { rows, next } = await getContentFeed(kind, cursorOf(before, id))

  return (
    <>
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        קונסולת אדמין
      </Link>
      <h1 className="t-page">תוכן</h1>

      <nav aria-label="סוג תוכן" className="flex flex-wrap gap-2">
        {(Object.keys(CONTENT_KIND) as ContentKind[]).map((k) => (
          <Link
            key={k}
            href={{ pathname: '/admin/content', query: { kind: k } }}
            aria-current={k === kind ? 'page' : undefined}
            className={cn('inline-flex min-h-11 items-center rounded-xl border px-3 text-sm', k === kind ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted')}
          >
            {CONTENT_KIND[k]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-muted">אין כאן תוכן.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.map((c) => (
            <ContentRow key={`${c.kind}:${c.ref}`} c={c} />
          ))}
        </ul>
      )}

      {next && (
        <Link
          href={{ pathname: '/admin/content', query: { kind, before: next.before, id: next.beforeId } }}
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
      <div className="skeleton h-11 rounded-xl" />
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  )
}
