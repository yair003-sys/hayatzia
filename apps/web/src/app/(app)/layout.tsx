import { Suspense } from 'react'
import { TabBar } from '@/components/tab-bar'
import { SessionGate } from '@/features/profile/components/session-gate'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <SessionGate />
      </Suspense>
      <div className="mx-auto min-h-dvh max-w-md px-4 pt-6 pb-[calc(var(--tabbar-space)+1.5rem)]">{children}</div>
      <TabBar />
    </>
  )
}
