import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SignupFlow } from '@/features/profile/components/signup-flow'
import { safeNext } from '@/features/auth/safe-next'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'בחירת קבוצה' }

export default function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  return (
    <main className="su-page">
      <Suspense fallback={<div className="skeleton m-auto h-96 w-full rounded-2xl" aria-hidden="true" />}>
        {searchParams.then((q) => (
          <OnboardingGate next={typeof q.next === 'string' ? q.next : undefined} />
        ))}
      </Suspense>
    </main>
  )
}

async function OnboardingGate({ next }: { next?: string }) {
  const s = await getSessionProfile()
  if (s.status === 'signed-out') redirect('/login')
  if (s.status === 'ready' || s.status === 'disabled') redirect(safeNext(next, '/stand'))
  // Only a safe next (a scanned QR card) is carried through the sign-up.
  const back = safeNext(next, '')
  return <SignupFlow next={back || undefined} />
}
