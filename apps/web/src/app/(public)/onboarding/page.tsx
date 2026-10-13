import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SignupFlow } from '@/features/profile/components/signup-flow'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'בחירת קבוצה' }

export default function OnboardingPage() {
  return (
    <main className="su-page">
      <Suspense fallback={<div className="skeleton m-auto h-96 w-full rounded-2xl" aria-hidden="true" />}>
        <OnboardingGate />
      </Suspense>
    </main>
  )
}

async function OnboardingGate() {
  const s = await getSessionProfile()
  if (s.status === 'signed-out') redirect('/login')
  if (s.status === 'ready' || s.status === 'disabled') redirect('/stand')
  return <SignupFlow />
}
