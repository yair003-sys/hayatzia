import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getSessionProfile } from '@/features/profile/server/queries'
import { DemoSession } from '@/features/verification/components/demo-session'
import { getVerificationProvider } from '@/features/verification/server/select-provider'

export const metadata: Metadata = { title: 'אימות לדוגמה', robots: { index: false, follow: false } }

// The mock provider's session screen. Exists only where the mock runs (never production): anywhere else, not found.
export default function Page({ searchParams }: PageProps<'/me/verify/demo'>) {
  return (
    <section className="space-y-4">
      <h1 className="t-page">אימות לדוגמה (דמו)</h1>
      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden="true" />}>
        {searchParams.then((sp) => (
          <Demo session={typeof sp.session === 'string' ? sp.session : ''} />
        ))}
      </Suspense>
    </section>
  )
}

async function Demo({ session }: { session: string }) {
  const s = await getSessionProfile()
  if (getVerificationProvider()?.name !== 'mock') notFound()
  if (s.status !== 'ready') return <p className="text-muted">צריך להתחבר.</p>
  if (!/^[0-9a-f-]{36}$/.test(session)) return <p className="text-muted">האימות הזה לא נמצא. אפשר להתחיל חדש מ„אימות לנסיעות”.</p>
  return <DemoSession sessionId={session} />
}
