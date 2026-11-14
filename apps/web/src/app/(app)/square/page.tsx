import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { SquareFeed } from '@/features/square/components/square-feed'
import { getClip, getSquareFeed } from '@/features/square/server/queries'

export const metadata: Metadata = { title: 'הכיכר' }

export default function Page({ searchParams }: PageProps<'/square'>) {
  return (
    <section>
      <Suspense fallback={<FeedSkeleton />}>
        {searchParams.then((sp) => (
          <SquareScreen
            team={sp.f === 'team' || sp.f === 'mine'}
            focusId={typeof sp.c === 'string' && /^[0-9a-f-]{36}$/.test(sp.c) ? sp.c : undefined}
          />
        ))}
      </Suspense>
    </section>
  )
}

async function SquareScreen({ team, focusId }: { team: boolean; focusId?: string }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="text-muted">הכיכר פועלת רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <FeedSkeleton />
  const audience = team ? 'team' : 'all'
  // A clip opened from a private-chat link is shown first, even if it would sit deeper in (or outside) this tab's feed.
  const [clips, focus] = await Promise.all([getSquareFeed({ audience }), focusId ? getClip(focusId) : Promise.resolve(null)])
  return (
    <>
      <h1 className="sr-only">הכיכר</h1>
      <SquareFeed
        key={`${audience}:${focus?.id ?? clips?.[0]?.id ?? (clips ? '' : 'failed')}`}
        initial={clips}
        focus={focus}
        meId={s.userId}
        myTeamId={s.team.id}
        myNick={s.nick}
        teamShort={s.team.short}
        audience={audience}
        empty={team ? `עוד אין רילס של ${s.team.short}` : 'הכיכר ריקה כרגע'}
        tabs={
          <nav className="sq-tabs" aria-label="לשוניות">
            <Link href="/square" aria-current={!team ? 'page' : undefined}>
              כל הליגה
            </Link>
            <Link href="/square?f=team" aria-current={team ? 'page' : undefined}>
              {s.team.short}
            </Link>
          </nav>
        }
      />
    </>
  )
}

function FeedSkeleton() {
  return <div className="sq-root skeleton" aria-hidden="true" />
}
