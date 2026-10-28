'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/**
 * "לא הצלחנו לטעון. נסה שוב" in place of data that failed to load (load test 2026-10-17, finding 6: never a 0 or an
 * empty list). The button reloads the screen's server data (router.refresh), or runs `onRetry` when the caller loads
 * the data itself. Text from the `common` catalogue (Hebrew by default).
 */
export function LoadError({ onRetry, className, compact = false }: { onRetry?: () => void | Promise<void>; className?: string; compact?: boolean }) {
  const t = useTranslations('common')
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
      <p>{t('loadFailed')}</p>
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
        {pending ? t('loading') : t('retry')}
      </button>
    </div>
  )
}
