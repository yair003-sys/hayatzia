'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { MatchTab } from '../live'

const TABS: { id: MatchTab; label: string }[] = [
  { id: 'game', label: 'משחק' },
  { id: 'lineup', label: 'הרכב' },
  { id: 'room', label: 'חדר' },
]

/**
 * Pill tabs for the match page. All three panels are rendered once and the inactive ones are `hidden`,
 * so the room (chat, polls, realtime) never remounts on a tab click; `?tab=` follows the choice.
 */
export function MatchTabs({ initial, game, lineup, room }: { initial: MatchTab; game: ReactNode; lineup: ReactNode; room: ReactNode }) {
  const [tab, setTab] = useState<MatchTab>(initial)
  const refs = useRef<Partial<Record<MatchTab, HTMLButtonElement | null>>>({})
  const panels: Record<MatchTab, ReactNode> = { game, lineup, room }

  function select(next: MatchTab, focus = false) {
    setTab(next)
    if (focus) refs.current[next]?.focus()
    const params = new URLSearchParams(window.location.search)
    params.set('tab', next)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }

  // RTL: the next tab sits to the left.
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab)
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      select(TABS[e.key === 'Home' ? 0 : TABS.length - 1]!.id, true)
    } else if (step) {
      e.preventDefault()
      select(TABS[(i + step + TABS.length) % TABS.length]!.id, true)
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="תצוגת המשחק" className="lc-tabs" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`mt-tab-${t.id}`}
            aria-controls={`mt-panel-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className="lc-tab"
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`mt-panel-${t.id}`} aria-labelledby={`mt-tab-${t.id}`} hidden={tab !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </div>
  )
}
