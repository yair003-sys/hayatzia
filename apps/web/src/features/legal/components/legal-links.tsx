import Link from 'next/link'
import { LEGAL_LINKS } from '@/lib/legal'
import { cn } from '@/lib/utils'

/** "תנאי שימוש · פרטיות · נגישות": the small legal row under public pages and in "הכרטיס שלי". */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="מידע משפטי" className={cn('lg-links', className)}>
      {LEGAL_LINKS.map((l, i) => (
        <span key={l.href} className="contents">
          {i > 0 && <span aria-hidden="true">·</span>}
          <Link href={l.href}>{l.label}</Link>
        </span>
      ))}
    </nav>
  )
}
