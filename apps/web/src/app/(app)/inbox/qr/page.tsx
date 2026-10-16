import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { MyQr, QrScanner } from '@/features/dm/components/my-qr'
import { getPrivateProfile, getSessionProfile } from '@/features/profile/server/queries'

export const metadata: Metadata = { title: 'הברקוד שלי' }

// "הברקוד שלי" (2026-10-16): show it at the stadium, or scan another fan's.
export default function Page() {
  return (
    <section className="space-y-4">
      <Link href="/inbox" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        כל השיחות
      </Link>
      <h1 className="t-page">הברקוד שלי</h1>
      <Suspense fallback={<div className="skeleton mx-auto aspect-square w-full max-w-72 rounded-2xl" aria-hidden="true" />}>
        <Qr />
      </Suspense>
    </section>
  )
}

async function Qr() {
  const s = await getSessionProfile()
  if (s.status === 'disabled') return <p className="text-muted">הברקוד פועל רק כשהשרת מחובר.</p>
  if (s.status !== 'ready') return null
  const p = await getPrivateProfile()
  if (!p) return <p className="text-muted">לא הצלחנו לטעון את הברקוד. נסה שוב</p>
  return (
    <div className="space-y-6">
      <MyQr code={p.qrCode} nick={s.nick} />
      <QrScanner />
    </div>
  )
}
