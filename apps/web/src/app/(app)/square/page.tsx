import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { SquareFeed } from '@/features/square/components/square-feed'
import { getSquareFeed } from '@/features/square/server/queries'

export const metadata: Metadata = { title: 'הכיכר' }

export default function Page({ searchParams }: PageProps<'/square'>) {
  return (
    <section>
      <Suspense fallback={<FeedSkeleton />}>
        {searchParams.then((sp) => (
          <SquareScreen team={sp.f === 'team' || sp.f === 'mine'} />
        ))}
      </Suspense>
    </section>
  )
}

async function SquareScreen({ team }: { team: boolean }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="text-muted">הכיכר פועלת רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <FeedSkeleton />
  const audience = team ? 'team' : 'all'
  const clips = await getSquareFeed({ audience })
  return (
    <>
      <h1 className="sr-only">הכיכר</h1>
      <SquareFeed
        key={`${audience}:${clips[0]?.id ?? ''}`}
        initial={clips}
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
