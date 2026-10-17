'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

/** What a screen says when its data could not be read (load test 2026-10-17, finding 6): never a 0 or an empty list. */
export const LOAD_ERROR_TEXT = 'לא הצלחנו לטעון.'
export const RETRY_TEXT = 'נסה שוב'

/**
 * "לא הצלחנו לטעון. נסה שוב" in place of data that failed to load. The button reloads the screen's server data
 * (router.refresh), or runs `onRetry` when the caller loads the data itself.
 */
export function LoadError({ onRetry, className, compact = false }: { onRetry?: () => void | Promise<void>; className?: string; compact?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border border-line text-center text-sm',
        compact ? 'px-3 py-2' : 'px-4 py-6',
        className,
      )}
    >
      <p>{LOAD_ERROR_TEXT}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (onRetry) await onRetry()
            else router.refresh()
          })
        }
        className="min-h-11 rounded-full border border-line px-4 font-semibold disabled:opacity-50"
      >
        {pending ? 'טוען…' : RETRY_TEXT}
      </button>
    </div>
  )
}
