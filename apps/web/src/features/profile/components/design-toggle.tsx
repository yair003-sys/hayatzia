'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DesignVersion } from '@/lib/design-version'
import { setDesignVersion } from '../server/design-actions'

/**
 * "עיצוב חדש (ניסיוני)" in "הכרטיס שלי" (stadium redesign, 2026-10-17): a switch that turns the new stadium look on
 * or off for this browser, through the design cookie. Default off. A real switch button with an aria-checked state;
 * after the server saves the cookie the router refreshes so the new look shows at once.
 */
export function DesignToggle({ initial }: { initial: DesignVersion }) {
  const [on, setOn] = useState(initial === 'stadium')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const id = useId()

  const toggle = () => {
    const next: DesignVersion = on ? 'classic' : 'stadium'
    // Optimistic: flip the switch now, then save; on failure, flip back and say so.
    setOn(next === 'stadium')
    setMsg(null)
    start(async () => {
      try {
        await setDesignVersion(next)
        router.refresh()
      } catch {
        setOn(next !== 'stadium')
        setMsg('השמירה נכשלה. נסה שוב')
      }
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
      <Sparkles className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-label`} className="text-sm font-medium">
          עיצוב חדש (ניסיוני)
        </span>
        <span className="text-xs text-dim">מסך בית בסגנון אצטדיון, בצבעי הקבוצה שלך. אפשר לכבות בכל רגע.</span>
        {msg && (
          <span role="status" className="mt-1 text-xs text-live">
            {msg}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        disabled={pending}
        onClick={toggle}
        className={cn(
          'relative inline-flex h-7 w-12 flex-none items-center rounded-full border transition-colors disabled:opacity-60',
          on ? 'border-ok bg-ok/30' : 'border-line bg-surface-3',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('absolute size-5 rounded-full bg-fg transition-all', on ? 'start-6' : 'start-1')}
          style={on ? { background: '#00FF66' } : undefined}
        />
      </button>
    </div>
  )
}
