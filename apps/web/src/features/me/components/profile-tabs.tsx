'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ProfileTab = { key: string; label: string; node: ReactNode }

/** The word-tabs on the fan's card (profile redesign, 2026-10-31): the clips grid, matches attended, matches rated.
 *  The active pill wears the club's colour. Content is rendered on the server and passed in as nodes. */
export function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? '')
  const current = tabs.find((t) => t.key === active) ?? tabs[0]
  return (
    <section aria-label="התוכן שלי" className="space-y-3">
      <div role="tablist" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = t.key === active
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={cn('min-h-9 shrink-0 rounded-full border px-4 text-sm font-bold transition', on ? 'border-transparent' : 'border-line text-muted')}
              style={on ? { background: 'rgb(var(--club-rgb))', color: 'var(--club-on)' } : undefined}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel">{current?.node}</div>
    </section>
  )
}

/** A small honest panel for a tab whose detailed list isn't built yet: one real number, no fake grid. */
export function CountPanel({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid place-items-center gap-1 rounded-2xl border border-line bg-surface px-5 py-8 text-center">
      <p className="t-num text-4xl font-black text-fg">{value.toLocaleString('he-IL')}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}
