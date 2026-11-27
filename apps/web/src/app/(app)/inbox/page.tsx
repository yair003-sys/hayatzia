import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { Clapperboard, Lock, QrCode, Users } from 'lucide-react'
import { LoadError } from '@/components/load-error'
import { InboxList } from '@/features/dm/components/inbox-list'
import { InboxLive } from '@/features/dm/components/inbox-live'
import { getInbox } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import type { Team } from '@/features/teams/data'

export const metadata: Metadata = { title: 'הודעות' }

export default function Page({ searchParams }: PageProps<'/inbox'>) {
  return (
    <section className="space-y-4">
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden="true" />}>
        {searchParams.then((sp) => {
          const shareClip = typeof sp.clip === 'string' && /^[0-9a-f-]{36}$/.test(sp.clip) ? sp.clip : undefined
          return <Inbox shareClip={shareClip} />
        })}
      </Suspense>
    </section>
  )
}

/** The ordinary inbox header: title + my QR. */
function InboxHeader() {
  return (
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
  )
}

/** Choosing a friend to send a Square clip to (2026-11-14): a clear banner replaces the usual header. */
function ShareHeader() {
  return (
    <header className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <div>
          <b className="block">בחרו חבר לשליחת הסרטון</b>
          <span className="text-xs text-muted">הסרטון יישלח לצ׳אט פרטי ומוצפן</span>
        </div>
      </div>
      <Link href="/square" className="shrink-0 text-sm text-muted">
        ביטול
      </Link>
    </header>
  )
}

async function Inbox({ shareClip }: { shareClip?: string }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">ההודעות פועלות רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const sharing = !!shareClip
  const inbox = await getInbox(s.userId)
  if (!inbox) {
    return (
      <>
        {sharing ? <ShareHeader /> : <InboxHeader />}
        {/* Still live: a new message refreshes the screen, which tries the read again. */}
        <InboxLive meId={s.userId} />
        {!sharing && <ClubChatRow team={s.team} />}
        <LoadError />
      </>
    )
  }
  const { rows, invites } = inbox
  return (
    <>
      {sharing ? <ShareHeader /> : <InboxHeader />}
      <InboxLive meId={s.userId} />
      {!sharing && <ClubChatRow team={s.team} />}
      <InboxList meId={s.userId} rows={rows} invites={invites} shareClip={shareClip} />
    </>
  )
}

/** The club group chat, pinned at the top of the inbox as a flat row (Telegram-style), so it sits in one clean
 *  column with the private chats instead of a framed card (2026-11-27). */
function ClubChatRow({ team }: { team: Team }) {
  return (
    <div className="ib-list">
      <Link href="/stand/chat" className="ib-row">
        <span className="ib-avatar" style={{ background: 'var(--color-elev)' }} aria-hidden="true">
          <TeamScarf team={team} className="h-7 w-2.5" />
        </span>
        <div className="ib-body">
          <div className="flex items-baseline gap-2">
            <b className="ib-name">צ׳אט {team.short}</b>
            <span className="ib-time inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden="true" />
              קבוצתי
            </span>
          </div>
          <p className="ib-preview">הצ׳אט הקבוצתי · כל אוהדי {team.short}</p>
        </div>
      </Link>
    </div>
  )
}
