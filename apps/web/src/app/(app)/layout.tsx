import { Suspense } from 'react'
import { TabBar } from '@/components/tab-bar'
import { BellGate } from '@/features/activity/components/bell-gate'
import { BirthDateGate } from '@/features/profile/components/birth-date-gate'
import { ClubTheme } from '@/features/profile/components/club-theme'
import { SessionGate } from '@/features/profile/components/session-gate'
import { AlertBannerGate } from '@/features/push/components/alert-banner-gate'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // display:contents wrapper: carries the club colour (set by ClubTheme) to every child — feed, bell, tab bar —
    // without adding a box. The club read is dynamic, so it lives inside its own <Suspense> like the other gates.
    <div className="app-shell contents">
      <Suspense fallback={null}>
        <ClubTheme />
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
    </div>
  )
}
