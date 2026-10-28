'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { Clapperboard, IdCard, Mail, MessagesSquare, Trophy, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'

type Tab = { href: Route; labelKey: string; icon: LucideIcon }

/** Owner, 2026-10-15: five tiles, the Square in the middle; the home is the onefan logo in the top bar.
 *  Labels come from the `nav` message catalogue (Hebrew by default), so the bar is ready for other languages. */
export const TABS: readonly Tab[] = [
  { href: '/matches', labelKey: 'matches', icon: Trophy },
  { href: '/stand/chat', labelKey: 'chat', icon: MessagesSquare },
  { href: '/square', labelKey: 'square', icon: Clapperboard },
  { href: '/inbox', labelKey: 'inbox', icon: Mail },
  { href: '/me', labelKey: 'me', icon: IdCard },
]

export function activeTab(pathname: string): Route | null {
  return TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? null
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
              <Link href={href} aria-current={on ? 'page' : undefined} className="tb-link" data-main={href === '/square' || undefined}>
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
