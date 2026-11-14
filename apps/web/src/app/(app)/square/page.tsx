import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { SquareFeed } from '@/features/square/components/square-feed'
import { getClip, getFollowingFeed, getSquareFeed } from '@/features/square/server/queries'

export const metadata: Metadata = { title: 'הכיכר' }

type View = 'all' | 'team' | 'following'

export default function Page({ searchParams }: PageProps<'/square'>) {
  return (
    <section>
      <Suspense fallback={<FeedSkeleton />}>
        {searchParams.then((sp) => {
          const view: View = sp.f === 'following' ? 'following' : sp.f === 'team' || sp.f === 'mine' ? 'team' : 'all'
          const focusId = typeof sp.c === 'string' && /^[0-9a-f-]{36}$/.test(sp.c) ? sp.c : undefined
          return <SquareScreen view={view} focusId={focusId} />
        })}
      </Suspense>
    </section>
  )
}

async function SquareScreen({ view, focusId }: { view: View; focusId?: string }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') {
    return <p className="text-muted">הכיכר פועלת רק כשהשרת מחובר (לא בסביבה הזאת).</p>
  }
  if (s.status !== 'ready') return <FeedSkeleton />
  const following = view === 'following'
  const audience = view === 'team' ? 'team' : 'all'
  // A clip opened from a private-chat link is shown first, even if it would sit deeper in (or outside) this tab's feed.
  const [clips, focus] = await Promise.all([
    following ? getFollowingFeed() : getSquareFeed({ audience }),
    focusId ? getClip(focusId) : Promise.resolve(null),
  ])
  const empty = following ? 'עדיין אין כאן כלום — עקבו אחרי אוהדים כדי לראות את הרגעים שלהם' : view === 'team' ? `עוד אין רילס של ${s.team.short}` : 'הכיכר ריקה כרגע'
  return (
    <>
      <h1 className="sr-only">הכיכר</h1>
      <SquareFeed
        key={`${view}:${focus?.id ?? clips?.[0]?.id ?? (clips ? '' : 'failed')}`}
        initial={clips}
        focus={focus}
        following={following}
        meId={s.userId}
        myTeamId={s.team.id}
        myNick={s.nick}
        teamShort={s.team.short}
        audience={audience}
        empty={empty}
        tabs={
          <nav className="sq-tabs" aria-label="לשוניות">
            <Link href="/square" aria-current={view === 'all' ? 'page' : undefined}>
              כל הליגה
            </Link>
            <Link href="/square?f=team" aria-current={view === 'team' ? 'page' : undefined}>
              {s.team.short}
            </Link>
            <Link href="/square?f=following" aria-current={view === 'following' ? 'page' : undefined}>
              עוקבים
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
