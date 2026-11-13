'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Two tabs inside "שירי הקהל": the club's curated songs, and the fan greenhouse ("שירים שכתבתי"). */
export function ChantsTabs({ teamSongs, greenhouse }: { teamSongs: ReactNode; greenhouse: ReactNode }) {
  const [tab, setTab] = useState<'team' | 'mine'>('team')
  const btn = (key: 'team' | 'mine', label: string) => {
    const on = tab === key
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => setTab(key)}
        className={cn('flex-1 rounded-full py-2 text-sm font-bold transition-colors', on ? 'text-[var(--acc-on,#fff)]' : 'text-muted')}
        style={on ? { background: 'linear-gradient(150deg, var(--acc2, var(--color-accent-2)), var(--acc, var(--color-accent)))' } : undefined}
      >
        {label}
      </button>
    )
  }
  return (
    <div>
      <div role="tablist" aria-label="שירי הקהל" className="mb-4 flex gap-1 rounded-full border border-line bg-surface p-1">
        {btn('team', 'שירי קבוצה')}
        {btn('mine', 'שירים שכתבתי')}
      </div>
      <div hidden={tab !== 'team'}>{teamSongs}</div>
      <div hidden={tab !== 'mine'}>{greenhouse}</div>
    </div>
  )
}
