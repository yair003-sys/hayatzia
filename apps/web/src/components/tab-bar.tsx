'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { House, MessageCircle, Trophy, Clapperboard, IdCard, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'

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

/** Pure view: the same markup is the static shell (no active tab) and the live bar. A floating pill of icons;
 *  each link is named by its Hebrew label (aria-label), and the active one sits in a blue circle. */
function TabBarView({ active }: { active: Route | null }) {
  return (
    <nav aria-label="ניווט ראשי" className="tb-pill" data-dark={active === '/square'}>
      <ul>
        {TABS.map(({ href, label, icon: Icon }) => {
          const on = active === href
          return (
            <li key={href}>
              <Link href={href} aria-label={label} title={label} aria-current={on ? 'page' : undefined} className="tb-link">
                <Icon aria-hidden className="size-[1.3rem]" strokeWidth={2} />
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
