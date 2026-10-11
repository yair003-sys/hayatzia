'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, MessageCircle, Trophy, Clapperboard, IdCard, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import { cn } from '@/lib/utils'

type Tab = { href: Route; label: string; icon: LucideIcon }

export const TABS: readonly Tab[] = [
  { href: '/stand', label: 'היציע שלי', icon: House },
  { href: '/matches', label: 'משחקים', icon: Trophy },
  { href: '/square', label: 'הכיכר', icon: Clapperboard },
  { href: '/inbox', label: 'הודעות', icon: MessageCircle },
  { href: '/me', label: 'הכרטיס שלי', icon: IdCard },
]

export function TabBar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-elev/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-dim transition-colors',
                  active && 'text-fg',
                )}
              >
                <Icon aria-hidden className={cn('size-5', active && 'text-accent-text')} strokeWidth={2.2} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
