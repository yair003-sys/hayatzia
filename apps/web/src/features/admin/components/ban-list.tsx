'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { banUntilLabel } from '../schema'
import type { BanRow } from '../server/queries'
import { unbanUserAction } from '../server/actions'

/** Fans suspended right now, each with "בטל השעיה". */
export function BanList({ bans }: { bans: BanRow[] }) {
  const t = useTranslations('admin')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, start] = useTransition()
  if (bans.length === 0) return <p className="text-sm text-muted">{t('noBans')}</p>
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {bans.map((b) => (
          <li key={b.user_id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{b.nick ?? t('fan')}</p>
              <p className="text-xs text-dim">
                {banUntilLabel(b.until)}
                {b.reason ? ` · ${b.reason}` : ''}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await unbanUserAction({ userId: b.user_id })
                  setMsg(r.data?.ok ? t('banLifted') : (r.data?.error ?? r.serverError ?? t('actionFailed')))
                })
              }
              className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm disabled:opacity-50"
            >
              {t('liftBan')}
            </button>
          </li>
        ))}
      </ul>
      {msg && (
        <p role="status" className="text-sm text-muted">
          {msg}
        </p>
      )}
    </div>
  )
}
