import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { SquareFeed } from '@/features/square/components/square-feed'
import { UploadClip } from '@/features/square/components/upload-clip'
import { getSquareFeed } from '@/features/square/server/queries'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'הכיכר' }

export default function Page({ searchParams }: PageProps<'/square'>) {
  return (
    <section className="space-y-3">
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
  const tab = (on: boolean) =>
    cn('flex-1 rounded-full py-2 text-center text-sm font-bold transition-colors', on ? 'bg-surface-3 text-fg shadow-[0_2px_8px_rgb(0_0_0/.45)]' : 'text-muted')
  return (
    <>
      <header className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-black">הכיכר</h1>
        <nav className="flex flex-1 gap-1 rounded-full bg-elev p-1" aria-label="לשוניות">
          <Link href="/square" aria-current={!team ? 'page' : undefined} className={tab(!team)}>
            כל הליגה
          </Link>
          <Link href="/square?f=team" aria-current={team ? 'page' : undefined} className={tab(team)}>
            {s.team.short}
          </Link>
        </nav>
      </header>
      <UploadClip meId={s.userId} audience={audience} teamShort={s.team.short} />
      <SquareFeed
        key={`${audience}:${clips[0]?.id ?? ''}`}
        initial={clips}
        meId={s.userId}
        myTeamId={s.team.id}
        audience={audience}
        empty={team ? `עוד אין רילס של ${s.team.short}. תעלה את הראשון 🎬` : 'הכיכר ריקה כרגע. תהיה הראשון להעלות 📸'}
      />
      <p className="text-center text-xs text-dim">
        {team ? `רק אוהדי ${s.team.short} רואים את הלשונית הזאת · ` : ''}כל פוסט נעלם אחרי 24 שעות
      </p>
    </>
  )
}

function FeedSkeleton() {
  return <div className="skeleton h-[70dvh] rounded-3xl" aria-hidden="true" />
}
