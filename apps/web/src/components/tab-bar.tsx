'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { House, MessageCircle, Trophy, Clapperboard, IdCard, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import { cn } from '@/lib/utils'

type Tab = { href: Route; label: string; icon: LucideIcon }

export const TABS: readonly Tab[] = [
  { href: '/stand', label: 'onefan', icon: House },
  { href: '/matches', label: 'משחקים', icon: Trophy },
  { href: '/square', label: 'הכיכר', icon: Clapperboard },
  { href: '/inbox', label: 'הודעות', icon: MessageCircle },
  { href: '/me', label: 'הכרטיס שלי', icon: IdCard },
]

export function activeTab(pathname: string): Route | null {
  return TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? null
}

/** Pure view: the same markup is the static shell (no active tab) and the live bar. */
function TabBarView({ active }: { active: Route | null }) {
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-elev/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const on = active === href
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-dim transition-colors',
                  on && 'text-fg',
                )}
              >
                <Icon aria-hidden className={cn('size-5', on && 'text-accent-text')} strokeWidth={2.2} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function LiveTabBar() {
  return <TabBarView active={activeTab(usePathname())} />
}

/** The pathname is request data on dynamic routes, so the live bar streams in over an identical static shell. */
export function TabBar() {
  return (
    <Suspense fallback={<TabBarView active={null} />}>
      <LiveTabBar />
    </Suspense>
  )
}
