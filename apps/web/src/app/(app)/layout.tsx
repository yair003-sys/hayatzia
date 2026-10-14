import { Suspense } from 'react'
import { TabBar } from '@/components/tab-bar'
import { BellGate } from '@/features/activity/components/bell-gate'
import { SessionGate } from '@/features/profile/components/session-gate'
import { AlertBannerGate } from '@/features/push/components/alert-banner-gate'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <SessionGate />
      </Suspense>
      <Suspense fallback={null}>
        <AlertBannerGate />
      </Suspense>
      <Suspense fallback={null}>
        <BellGate />
      </Suspense>
      {/* The top strip (under the notch) is kept free for the bell, so it never sits on a page's first line. */}
      <div className="app-main mx-auto min-h-dvh max-w-md px-4 pb-28">{children}</div>
      <TabBar />
    </>
  )
}
