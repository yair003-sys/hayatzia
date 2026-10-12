import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { getSessionProfile } from '@/features/profile/server/queries'
import { signOutAction } from '@/features/profile/server/actions'
import { InstallApp } from '@/features/pwa/install-app'
import { PushToggle } from '@/features/push/components/push-toggle'
import { pushConfigured } from '@/features/push/server/send'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: 'הכרטיס שלי' }

export default function MePage() {
  return (
    <section className="space-y-5">
      <h1 className="font-display text-3xl font-black">הכרטיס שלי</h1>
      <Suspense fallback={<div className="skeleton h-32 rounded-lg" aria-hidden="true" />}>
        <ProfileCard />
      </Suspense>
    </section>
  )
}

async function ProfileCard() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return <p className="rounded-md bg-surface p-4 text-muted">אין חשבון מחובר בסביבה הזאת.</p>
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg bg-surface p-5">
        <TeamScarf team={s.team} className="h-12 w-4" />
        <div>
          <p className="font-display text-2xl font-black">{s.nick}</p>
          <p className="text-muted">אוהד {s.team.name} · הקבוצה נעולה</p>
        </div>
      </div>
      <InstallApp />
      {pushConfigured() && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && <PushToggle vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />}
      <form action={signOutAction}>
        <button type="submit" className="w-full rounded-lg border border-line py-3 font-semibold text-muted">
          יציאה מהחשבון
        </button>
      </form>
    </div>
  )
}
