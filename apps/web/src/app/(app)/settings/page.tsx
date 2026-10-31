import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { IdCard } from 'lucide-react'
import { getPrivateProfile, getSessionProfile } from '@/features/profile/server/queries'
import { DmRequestsSetting } from '@/features/dm/components/dm-requests-setting'
import { SignOutButton } from '@/features/profile/components/sign-out-button'
import { InstallApp } from '@/features/pwa/install-app'
import { PushToggle } from '@/features/push/components/push-toggle'
import { pushConfigured } from '@/features/push/server/send'
import { NotificationSettings } from '@/features/push/components/notification-settings'
import { getMyPrefs } from '@/features/push/server/queries'
import { env } from '@/lib/env'
import { DeleteAccount } from '@/features/account/components/delete-account'
import { AdminBadge } from '@/features/admin/components/admin-badge'
import { ContactForm } from '@/features/safety/components/contact-form'
import { LegalLinks } from '@/features/legal/components/legal-links'
import { NOT_AFFILIATED } from '@/lib/legal'
import { GenderPicker } from '@/features/team-life/components/ride-safety'
import { getMyRideProfile } from '@/features/team-life/server/queries'
import { features } from '@/lib/flags'

export const metadata: Metadata = { title: 'הגדרות' }

// Settings live on their own page (owner, 2026-10-31: "move them off the card to one place"), reached from the gear
// next to the bell. The card (/me) is now a clean profile.
export default function SettingsPage() {
  return (
    <section className="space-y-4">
      <h1 className="t-page">הגדרות</h1>
      <Suspense fallback={<div className="skeleton h-72 rounded-3xl" aria-hidden="true" />}>
        <Settings />
      </Suspense>
    </section>
  )
}

async function Settings() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') {
    return <p className="rounded-2xl bg-surface p-4 text-muted">אין חשבון מחובר בסביבה הזאת.</p>
  }
  const [prefs, ride, priv] = await Promise.all([getMyPrefs(s.userId), getMyRideProfile(), getPrivateProfile()])

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <Suspense fallback={null}>
          <AdminBadge />
        </Suspense>
        <InstallApp />
        {pushConfigured() && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && <PushToggle vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />}
        <NotificationSettings initial={prefs} />
        {features.rides && (
          <>
            <GenderPicker initial={ride?.gender ?? null} />
            <Link href="/me/verify" className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-line px-4 py-3 font-medium">
              <IdCard className="size-4" aria-hidden="true" />
              אימות לנסיעות
            </Link>
          </>
        )}
        {priv && <DmRequestsSetting initial={priv.dmRequests} />}
        <SignOutButton />
        <ContactForm />
        <DeleteAccount />
      </div>
      <LegalLinks />
      <p className="text-center text-xs text-dim">{NOT_AFFILIATED}</p>
    </div>
  )
}
