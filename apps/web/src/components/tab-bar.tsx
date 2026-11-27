'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { Clapperboard, Home, MessageSquare, Shield, Users, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'

type Tab = { href: Route; labelKey: string; icon: LucideIcon }

/** Owner, 2026-11-27 (home redesign): five tabs matching the onefan mockup — home, square, inbox, community, my card. */
export const TABS: readonly Tab[] = [
  { href: '/stand', labelKey: 'home', icon: Home },
  { href: '/square', labelKey: 'square', icon: Clapperboard },
  { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
  { href: '/stand/hub', labelKey: 'community', icon: Users },
  { href: '/me', labelKey: 'me', icon: Shield },
]

/** The home (/stand) matches only exactly, so its many sub-routes (/stand/wall, /stand/hub, …) don't all light it up;
 *  every other tab matches itself or a child path. */
export function activeTab(pathname: string): Route | null {
  return TABS.find((t) => pathname === t.href || (t.href !== '/stand' && pathname.startsWith(`${t.href}/`)))?.href ?? null
}

/** Pure view: the same markup is the static shell (no active tab) and the live bar. A floating rectangle of tiles,
 *  each an icon over its Hebrew label; the Square, in the middle, is the raised one. */
function TabBarView({ active }: { active: Route | null }) {
  const t = useTranslations('nav')
  return (
    <nav aria-label={t('main')} className="tb-pill" data-dark={active === '/square'}>
      <ul>
        {TABS.map(({ href, labelKey, icon: Icon }) => {
          const on = active === href
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? 'page' : undefined} className="tb-link">
                <span className="tb-icon">
                  <Icon aria-hidden className="size-[1.25rem]" strokeWidth={2} />
                </span>
                <span className="tb-label">{t(labelKey)}</span>
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
