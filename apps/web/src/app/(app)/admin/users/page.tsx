import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserRow } from '@/features/admin/components/user-row'
import { getFansByTeam, getUserList, isAppAdmin, type Cursor } from '@/features/admin/server/queries'

export const metadata: Metadata = { title: 'משתמשים · אדמין', robots: { index: false, follow: false } }

type Param = string | string[] | undefined

export default function Page({ searchParams }: PageProps<'/admin/users'>) {
  return (
    <section className="space-y-5">
      <Suspense fallback={<Skeleton />}>
        {searchParams.then((sp) => <Screen q={sp.q} team={sp.team} before={sp.before} id={sp.id} />)}
      </Suspense>
    </section>
  )
}

function cursorOf(before: Param, id: Param): Cursor | null {
  if (typeof before !== 'string' || typeof id !== 'string') return null
  if (Number.isNaN(Date.parse(before)) || !/^[0-9a-f-]{36}$/.test(id)) return null
  return { before, beforeId: id }
}

async function Screen({ q, team: teamParam, before, id }: { q: Param; team: Param; before: Param; id: Param }) {
  if (!(await isAppAdmin())) notFound()
  const search = typeof q === 'string' ? q.trim() : ''
  const team = typeof teamParam === 'string' ? teamParam : ''
  const [{ rows, next }, byTeam] = await Promise.all([
    getUserList({ search: search || undefined, team: team || undefined, cursor: cursorOf(before, id) }),
    getFansByTeam(),
  ])

  const base = (extra: Record<string, string>) => ({ pathname: '/admin/users' as const, query: { ...(search ? { q: search } : {}), ...(team ? { team } : {}), ...extra } })

  return (
    <>
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        קונסולת אדמין
      </Link>
      <h1 className="t-page">משתמשים</h1>

      <form action="/admin/users" className="flex gap-2">
        {team && <input type="hidden" name="team" value={team} />}
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search className="size-4 shrink-0 text-dim" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="חיפוש לפי כינוי"
            aria-label="חיפוש לפי כינוי"
            className="min-h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button type="submit" className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium">
          חפש
        </button>
      </form>

      <nav aria-label="סינון לפי קבוצה" className="flex flex-wrap gap-2">
        <Link
          href={base({})}
          aria-current={team === '' ? 'page' : undefined}
          className={cn('inline-flex min-h-11 items-center rounded-xl border px-3 text-sm', team === '' ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted')}
        >
          הכול
        </Link>
        {byTeam.map((t) => (
          <Link
            key={t.team_id}
            href={{ pathname: '/admin/users', query: { ...(search ? { q: search } : {}), team: t.team_id } }}
            aria-current={team === t.team_id ? 'page' : undefined}
            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm', team === t.team_id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted')}
          >
            {t.team_name}
            <span className="t-num text-dim">{t.fans}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-muted">לא נמצאו אוהדים.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.map((u) => (
            <UserRow key={u.user_id} u={u} />
          ))}
        </ul>
      )}

      {next && (
        <Link href={base({ before: next.before, id: next.beforeId })} className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm">
          אוהדים נוספים
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
