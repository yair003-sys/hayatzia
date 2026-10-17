import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { TeamChat } from '@/features/team-chat/components/team-chat'
import { getTeamMessages } from '@/features/team-chat/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { getBlockedIdsOrNull } from '@/features/safety/server/queries'
import { LoadError } from '@/components/load-error'

export const metadata: Metadata = { title: 'צ׳אט הקבוצה' }

export default function Page() {
  return (
    <section>
      <Link href="/stand" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        onefan
      </Link>
      <Suspense fallback={<ChatSkeleton />}>
        <ChatScreen />
      </Suspense>
    </section>
  )
}

async function ChatScreen() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="text-muted">הצ׳אט פועל רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <ChatSkeleton />
  const [initial, hidden] = await Promise.all([getTeamMessages(), getBlockedIdsOrNull()])
  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <TeamScarf team={s.team} className="h-8 w-3" />
        <div>
          <h1 className="t-page">צ׳אט {s.team.short}</h1>
          <p className="text-xs text-muted">רק אוהדי {s.team.short} רואים את הצ׳אט הזה</p>
        </div>
      </header>
      {/* A failed history read is "could not load", never an empty chat that fills with live messages only. */}
      {initial && hidden ? (
        <TeamChat teamId={s.team.id} meId={s.userId} initial={initial} hidden={hidden} color={s.team.bg} clubName={s.team.name} />
      ) : (
        <LoadError />
      )}
    </>
  )
}

function ChatSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-10 w-1/2 rounded-md" />
      <div className="skeleton h-14 w-3/4 rounded-lg" />
      <div className="skeleton ms-auto h-14 w-2/3 rounded-lg" />
      <div className="skeleton h-14 w-3/4 rounded-lg" />
    </div>
  )
}
