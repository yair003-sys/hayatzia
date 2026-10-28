'use client'

import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

/** "החשבון נמחק": shown once on the welcome page after the fan deleted their account (/?deleted=1). */
export function DeletedNotice() {
  const t = useTranslations('account')
  const deleted = useSearchParams().get('deleted') === '1'
  if (!deleted) return null
  return (
    <p role="status" className="rounded-2xl border border-line bg-surface p-4 text-center text-sm">
      {t('deleted')}
    </p>
  )
}
