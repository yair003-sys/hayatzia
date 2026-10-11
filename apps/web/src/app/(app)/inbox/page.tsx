import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Lock } from 'lucide-react'
import { InboxLive } from '@/features/dm/components/inbox-live'
import { NewConversation } from '@/features/dm/components/new-conversation'
import { getThreads } from '@/features/dm/server/queries'
import { chatTime } from '@/features/chat/schema'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'הודעות' }

export default function Page() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black">הודעות</h1>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5 text-ok" aria-hidden="true" />
          שיחות פרטיות עם אוהדי הקבוצה שלך, מוצפנות מקצה לקצה.
        </p>
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
  const threads = await getThreads(s.userId)
  return (
    <>
      <InboxLive meId={s.userId} />
      <NewConversation />
      {threads.length === 0 ? (
        <p className="py-8 text-center text-muted">עוד אין שיחות.</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-lg border border-line-soft bg-surface">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/inbox/${t.id}`} className="flex items-center gap-3 px-4 py-3">
                <b className="flex-1">{t.otherNick}</b>
                {t.unreadHint && <span className="size-2 rounded-full bg-accent" aria-label="הודעה חדשה" />}
                <time dateTime={t.lastAt} className="text-xs text-dim">
                  {chatTime(t.lastAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
