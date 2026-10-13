import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { TeamPickerForm } from '@/features/profile/components/team-picker-form'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'בחירת קבוצה' }

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 px-6 pt-12 pb-16">
      <h1 className="font-display text-4xl font-black">ברוך הבא ל-onefan</h1>
      <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden="true" />}>
        <OnboardingGate />
      </Suspense>
    </main>
  )
}

async function OnboardingGate() {
  const s = await getSessionProfile()
  if (s.status === 'signed-out') redirect('/login')
  if (s.status === 'ready' || s.status === 'disabled') redirect('/stand')
  return <TeamPickerForm />
}
