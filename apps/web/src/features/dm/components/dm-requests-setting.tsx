'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { DM_REQUEST_OPTIONS, type DmRequests } from '../schema'
import { setDmRequestsAction } from '../server/actions'

/**
 * "מי יכול לשלוח לי בקשות" in "הכרטיס שלי" (2026-10-16). The default comes from the age: everyone from 18, the fan's
 * own club for 16–17. A QR code the fan shows always works.
 */
export function DmRequestsSetting({ initial }: { initial: DmRequests }) {
  const t = useTranslations('dm')
  const [value, setValue] = useState<DmRequests>(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const id = useId()
  return (
    <fieldset aria-describedby={`${id}-note`} className="space-y-2 rounded-2xl border border-line p-3">
      <legend className="px-1 text-sm font-medium">{t('whoCanRequest')}</legend>
      <div role="radiogroup" aria-label={t('whoCanRequest')} className="grid gap-2">
        {DM_REQUEST_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setDmRequestsAction({ value: o.value })
                if (r?.data && 'ok' in r.data) {
                  setValue(o.value)
                  setMsg(t('saved'))
                } else setMsg((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? t('saveFailed'))
              })
            }
            className={cn('min-h-11 rounded-xl border px-3 text-start text-sm', value === o.value ? 'border-accent bg-accent-soft font-semibold' : 'border-line text-muted')}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p id={`${id}-note`} className="text-xs text-dim">
        {t('requestNote')}
      </p>
      {msg && (
        <p role="status" className="text-xs text-muted">
          {msg}
        </p>
      )}
    </fieldset>
  )
}
