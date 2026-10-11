import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronLeft, Images, MessageCircle, Star, type LucideIcon } from 'lucide-react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'

export const metadata: Metadata = { title: 'היציע שלי' }

export default function Page() {
  return (
    <section className="space-y-5">
      <Suspense fallback={<div className="skeleton h-24 rounded-lg" aria-hidden="true" />}>
        <StandHeader />
      </Suspense>
      <StandCard href="/stand/chat" icon={MessageCircle} title="צ׳אט הקבוצה" badge="פתוח תמיד" text="רק אוהדי הקבוצה שלך. בזמן אמת." />
      <StandCard href="/stand/players" icon={Star} title="דירוג שחקנים" text="דרג את השחקנים וקרא מה האוהדים חושבים." />
      <StandCard href="/stand/photos" icon={Images} title="תמונות מהיציע" text="רגעים מהמגרש. רק אוהדי הקבוצה רואים." />

    </section>
  )
}

async function StandHeader() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return <h1 className="font-display text-3xl font-black">היציע שלי</h1>
  }
  return (
    <header className="flex items-center gap-3">
      <TeamScarf team={s.team} className="h-10 w-3.5" />
      <div>
        <h1 className="font-display text-3xl font-black">{s.team.name}</h1>
        <p className="text-sm text-muted">שלום {s.nick}</p>
      </div>
    </header>
  )
}

function StandCard(props: {
  href: '/stand/chat' | '/stand/players' | '/stand/photos'
  icon: LucideIcon
  title: string
  text: string
  badge?: string
}) {
  const Icon = props.icon
  return (
    <Link
      href={props.href}
      className="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-gradient-to-b from-surface-2 to-surface p-4 transition-colors hover:border-line-strong"
    >
      <span className="flex items-center gap-2.5">
        <Icon className="size-5 text-accent-text" aria-hidden="true" />
        <b className="font-display text-lg">{props.title}</b>
        {props.badge && (
          <span className="ms-auto rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">{props.badge}</span>
        )}
        <ChevronLeft className={props.badge ? 'size-4 text-dim' : 'ms-auto size-4 text-dim'} aria-hidden="true" />
      </span>
      <span className="text-sm text-muted">{props.text}</span>
    </Link>
  )
}
