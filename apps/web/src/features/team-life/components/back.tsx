import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export function BackToStand() {
  return (
    <Link href="/stand" className="inline-flex items-center gap-1 text-sm text-muted">
      <ChevronRight className="size-4" aria-hidden="true" />
      היציע שלי
    </Link>
  )
}
