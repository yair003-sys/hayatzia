import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SearchScreen } from '@/features/search/components/search-screen'

export const metadata: Metadata = { title: 'חיפוש' }

export default function Page() {
  return (
    <section className="space-y-4">
      <Link href="/stand" className="inline-flex items-center gap-1 text-sm text-muted">
        <ChevronRight className="size-4" aria-hidden="true" />
        חזרה
      </Link>
      <SearchScreen />
    </section>
  )
}
