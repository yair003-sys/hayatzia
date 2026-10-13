import { Suspense } from 'react'
import { TabBar } from '@/components/tab-bar'
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
      <div className="mx-auto min-h-dvh max-w-md px-4 pt-6 pb-28">{children}</div>
      <TabBar />
    </>
  )
}
