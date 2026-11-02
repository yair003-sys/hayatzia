import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Route } from 'next'
import { ChevronRight, Users, LayoutGrid, Flag, Megaphone, type LucideIcon } from 'lucide-react'
import { METRIC_LABEL, METRICS } from '@/features/admin/schema'
import { getFansByTeam, getOverviewCounts, isAppAdmin } from '@/features/admin/server/queries'

export const metadata: Metadata = { title: 'קונסולת אדמין', robots: { index: false, follow: false } }

// Overview console (owner, 2026-11-02): one place to see everything across all clubs and act, without logging in as a
// fan of any single club. Admins only; everyone else gets a plain "not found" (the database refuses them anyway).
export default function Page() {
  return (
    <section className="space-y-6">
      <Suspense fallback={<HubSkeleton />}>
        <Hub />
      </Suspense>
    </section>
  )
}

async function Hub() {
  if (!(await isAppAdmin())) notFound()
  const [counts, byTeam] = await Promise.all([getOverviewCounts(), getFansByTeam()])
  const maxFans = Math.max(1, ...byTeam.map((t) => Number(t.fans)))

  return (
    <>
      <Link href="/me" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        הכרטיס שלי
      </Link>
      <h1 className="t-page">קונסולת אדמין</h1>
      <p className="text-sm text-muted">מבט-על על כל הקבוצות. כאן רואים את כל הנתונים ופועלים — בלי להתחבר כאוהד של קבוצה מסוימת.</p>

      <section aria-labelledby="nums-title" className="space-y-2">
        <h2 id="nums-title" className="me-label">
          מספרים
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METRICS.map((m) => (
            <li key={m} className="rounded-2xl border border-line bg-surface p-3">
              <p className="t-num text-2xl font-bold">{counts[m] ?? 0}</p>
              <p className="text-xs text-dim">{METRIC_LABEL[m]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="teams-title" className="space-y-2">
        <h2 id="teams-title" className="me-label">
          אוהדים לפי קבוצה
        </h2>
        {byTeam.length === 0 ? (
          <p className="text-sm text-muted">אין עדיין אוהדים.</p>
        ) : (
          <ul className="space-y-1.5">
            {byTeam.map((t) => (
              <li key={t.team_id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm">{t.team_name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(Number(t.fans) / maxFans) * 100}%` }} />
                </span>
                <span className="t-num w-10 shrink-0 text-end text-sm font-medium">{t.fans}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="מסכי הקונסולה" className="grid gap-2 sm:grid-cols-2">
        <HubLink href="/admin/users" icon={Users} title="משתמשים" sub="כל האוהדים מכל הקבוצות · חיפוש, סינון, השעיה" />
        <HubLink href="/admin/content" icon={LayoutGrid} title="תוכן" sub="פוסטים, טרמפים, חדשות ודירוגים · מחיקה" />
        <HubLink href="/admin/reports" icon={Flag} title="דיווחים" sub="תור הדיווחים, חירום בנסיעות, אימותים" badge={counts.open_reports || undefined} />
        <HubLink href="/admin/campaigns" icon={Megaphone} title="קמפיינים" sub="גיוס המונים ותשלומים" />
      </nav>
    </>
  )
}

function HubLink({
  href,
  icon: Icon,
  title,
  sub,
  badge,
}: {
  href: Route
  icon: LucideIcon
  title: string
  sub: string
  badge?: number
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium">
          {title}
          {badge ? <span className="rounded-full bg-live px-2 py-0.5 text-xs font-bold text-white t-num">{badge}</span> : null}
        </span>
        <span className="block truncate text-xs text-dim">{sub}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 rotate-180 text-dim" aria-hidden="true" />
    </Link>
  )
}

function HubSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-8 w-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
