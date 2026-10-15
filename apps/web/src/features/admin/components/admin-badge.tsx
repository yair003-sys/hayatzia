import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { getOpenReportCount } from '../server/queries'

/** "דיווחים פתוחים" in "הכרטיס שלי", for admins only (renders nothing for anyone else). */
export async function AdminBadge() {
  const open = await getOpenReportCount()
  if (open === null) return null
  return (
    <Link
      href="/admin/reports"
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-line px-4 py-3 font-medium"
    >
      <span className="flex items-center gap-2">
        <ShieldAlert className="size-4" aria-hidden="true" />
        דיווחים פתוחים
      </span>
      <span
        className={open > 0 ? 'rounded-full bg-live px-2.5 py-0.5 text-sm font-bold text-white t-num' : 'text-sm text-muted t-num'}
        aria-label={`${open} דיווחים פתוחים`}
      >
        {open > 99 ? '99+' : open}
      </span>
    </Link>
  )
}
