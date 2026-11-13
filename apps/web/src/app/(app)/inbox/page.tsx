import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronLeft, Lock, QrCode, Users } from 'lucide-react'
import { LoadError } from '@/components/load-error'
import { InboxList } from '@/features/dm/components/inbox-list'
import { InboxLive } from '@/features/dm/components/inbox-live'
import { getInbox } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import type { Team } from '@/features/teams/data'

export const metadata: Metadata = { title: 'הודעות' }

export default function Page() {
  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="t-page">הודעות</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5 text-ok" aria-hidden="true" />
            מוצפן מקצה לקצה
          </p>
        </div>
        <Link href="/inbox/qr" className="flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm">
          <QrCode className="size-4" aria-hidden="true" />
          הברקוד שלי
        </Link>
      </header>
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden="true" />}>
        <Inbox />
      </Suspense>
    </section>
  )
}

async function Inbox() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">ההודעות פועלות רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const inbox = await getInbox(s.userId)
  if (!inbox) {
    return (
      <>
        {/* Still live: a new message refreshes the screen, which tries the read again. */}
        <InboxLive meId={s.userId} />
        <ClubChatRow team={s.team} />
        <LoadError />
      </>
    )
  }
  const { rows, invites } = inbox
  return (
    <>
      <InboxLive meId={s.userId} />
      <ClubChatRow team={s.team} />
      <InboxList meId={s.userId} rows={rows} invites={invites} />
    </>
  )
}

/** The club group chat, pinned at the top of the inbox so group and private chats live in one column (2026-11-14). */
function ClubChatRow({ team }: { team: Team }) {
  return (
    <Link
      href="/stand/chat"
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 active:scale-[0.99]"
    >
      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-elev">
        <TeamScarf team={team} className="h-7 w-2.5" />
        <span
          className="absolute -bottom-0.5 -end-0.5 grid size-5 place-items-center rounded-full border-2 border-surface"
          style={{ background: 'var(--acc, var(--color-accent))', color: 'var(--acc-on, #fff)' }}
        >
          <Users className="size-2.5" aria-hidden="true" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <b className="block">צ׳אט {team.short}</b>
        <span className="text-xs text-muted">הצ׳אט הקבוצתי · כל אוהדי {team.short}</span>
      </span>
      <ChevronLeft className="size-5 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  )
}
