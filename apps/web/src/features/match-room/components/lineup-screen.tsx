'use client'

import { useState, type ReactNode } from 'react'

/**
 * The line-up screen in the match centre: a switch between "הרכב המשחק" (the official XI on the pitch) and
 * "הרכב האוהדים" (the fans' own line-up). Both are rendered on the server and handed in as nodes; the switch only
 * shows one at a time (both stay mounted, so flipping back is instant and keeps any in-progress fan edits). Opens on
 * the match line-up — during a live game that's the thing fans came to see. When there is no fan line-up, the switch
 * is hidden and only the pitch shows.
 */
export function LineupScreen({ match, fan, hasFan }: { match: ReactNode; fan: ReactNode; hasFan: boolean }) {
  const [tab, setTab] = useState<'match' | 'fan'>('match')
  return (
    <div className="space-y-3">
      {hasFan && (
        <div className="lc-switch" role="tablist" aria-label="בחירת הרכב">
          <button type="button" role="tab" aria-selected={tab === 'match'} aria-pressed={tab === 'match'} onClick={() => setTab('match')}>
            <span>הרכב המשחק</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'fan'} aria-pressed={tab === 'fan'} onClick={() => setTab('fan')}>
            <span>הרכב האוהדים</span>
          </button>
        </div>
      )}
      <div hidden={hasFan && tab !== 'match'}>{match}</div>
      {hasFan && <div hidden={tab !== 'fan'}>{fan}</div>}
    </div>
  )
}
