import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AddCard } from '@/features/dm/components/add-card'
import { getQrCard } from '@/features/dm/server/queries'
import { getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'הוספת אוהד', robots: { index: false } }

// Where a scanned QR code lands (2026-10-16): any phone camera opens /add/<code>. Signed-out fans sign in first and come
// back here (the sign-in keeps ?next=/add/<code>).
export default function Page({ params }: PageProps<'/add/[code]'>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="sr-only">הוספת אוהד</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-2xl" aria-hidden="true" />}>
        {params.then(({ code }) => (
          <Card code={code} />
        ))}
      </Suspense>
    </main>
  )
}

async function Card({ code }: { code: string }) {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-center text-muted">הברקוד פועל רק כשהשרת מחובר.</p>
  if (s.status === 'signed-out') redirect(`/login?next=${encodeURIComponent(`/add/${code}`)}`)
  if (s.status === 'no-profile') redirect(`/onboarding?next=${encodeURIComponent(`/add/${code}`)}`)
  const card = await getQrCard(code)
  return <AddCard code={code} card={card} />
}
