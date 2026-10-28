'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { LOCALES, LOCALE_LABELS, type Locale } from '../config'
import { changeLocaleAction } from '../actions'

/** Language picker. Writes the locale cookie and refreshes so the whole app re-renders in the chosen language. */
export function LocaleSwitcher() {
  const t = useTranslations('common')
  const current = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="font-bold text-muted">{t('language')}</span>
      <select
        aria-label={t('chooseLanguage')}
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Locale
          startTransition(async () => {
            await changeLocaleAction(next)
            router.refresh()
          })
        }}
        className="rounded-xl border border-line bg-surface-2 px-3 py-2 font-bold outline-none focus:border-accent"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
