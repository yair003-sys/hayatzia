import { TabBar } from '@/components/tab-bar'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="mx-auto min-h-dvh max-w-md px-4 pt-6 pb-28">{children}</div>
      <TabBar />
    </>
  )
}
