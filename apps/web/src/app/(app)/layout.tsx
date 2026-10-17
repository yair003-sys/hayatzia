import { Suspense } from 'react'
import { TabBar } from '@/components/tab-bar'
import { BellGate } from '@/features/activity/components/bell-gate'
import { BirthDateGate } from '@/features/profile/components/birth-date-gate'
import { SessionGate } from '@/features/profile/components/session-gate'
import { AlertBannerGate } from '@/features/push/components/alert-banner-gate'
import { AppStadiumDecor } from '@/features/stadium/components/stadium-decor'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* Stadium redesign (stage 3): the opt-in stadium backdrop + club theme. Renders nothing for the classic design,
          so the static shell (.app-main and the tab bar) is untouched. Request-time, so it sits in its own <Suspense>. */}
      <Suspense fallback={null}>
        <AppStadiumDecor />
      </Suspense>
      <Suspense fallback={null}>
        <SessionGate />
      </Suspense>
      <Suspense fallback={null}>
        <BirthDateGate />
      </Suspense>
      <Suspense fallback={null}>
        <AlertBannerGate />
      </Suspense>
      <Suspense fallback={null}>
        <BellGate />
      </Suspense>
      {/* The top strip (under the notch) is kept free for the bell, so it never sits on a page's first line. */}
      <div className="app-main mx-auto min-h-dvh max-w-md px-4 pb-[calc(var(--tabbar-space)+1.5rem)]">{children}</div>
      <TabBar />
    </>
  )
}
