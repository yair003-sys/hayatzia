import { Suspense, type CSSProperties } from 'react'
import { TabBar } from '@/components/tab-bar'
import { BellGate } from '@/features/activity/components/bell-gate'
import { BirthDateGate } from '@/features/profile/components/birth-date-gate'
import { SessionGate } from '@/features/profile/components/session-gate'
import { getSessionProfile } from '@/features/profile/server/queries'
import { AlertBannerGate } from '@/features/push/components/alert-banner-gate'
import { teamAccent } from '@/features/stand-home/schema'

// The fan's club is locked at sign-up, so their colour is fixed. We set it once on .app-main and every screen
// inherits it (redesign 2026-11-05). getSessionProfile is cached, so this adds no extra query. Session-less
// screens get no --t-* and fall back to the neutral brand values in globals.css.
async function clubTheme(): Promise<CSSProperties | undefined> {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return undefined
  const a = teamAccent(s.team.bar)
  return { '--t-acc': a.accent, '--t-acc2': a.accent2, '--t-rgb': a.rgb, '--t-text': a.text, '--t-on': a.on } as CSSProperties
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await clubTheme()
  return (
    // display:contents wrapper: carries the club colour to every child (feed, bell, tab bar) without adding a box.
    <div className="app-shell contents" style={theme}>
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
