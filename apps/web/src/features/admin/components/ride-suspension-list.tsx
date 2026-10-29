'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { reportTime } from '../schema'
import type { RideSuspensionRow } from '../server/queries'
import { liftRideSuspensionAction } from '../server/actions'

/** Fans suspended from rides right now (a harm report, ride safety rule 9), each with "בטל השעיה מנסיעות". */
export function RideSuspensionList({ rows }: { rows: RideSuspensionRow[] }) {
  const t = useTranslations('admin')
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, start] = useTransition()
  if (rows.length === 0) return <p className="text-sm text-muted">{t('noRideSuspensions')}</p>
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.user_id} className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{r.nick ?? t('fan')}</p>
                <p className="text-xs text-dim">
                  {t('rideFrom', { time: reportTime(r.created_at) })}
                  {r.reason ? ` · ${r.reason}` : ''}
                </p>
              </div>
              {confirm !== r.user_id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(r.user_id)}
                  className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm disabled:opacity-50"
                >
                  {t('liftRideSuspension')}
                </button>
              )}
            </div>
            {confirm === r.user_id && (
              <div role="group" aria-label={t('confirmGroup')} className="space-y-2 rounded-xl border border-live/40 p-3">
                <p className="text-sm font-medium">{t('liftRideAsk')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const res = await liftRideSuspensionAction({ userId: r.user_id })
                        setConfirm(null)
                        setMsg(res.data?.ok ? t('rideSuspensionLifted') : (res.data?.error ?? res.serverError ?? t('actionFailed')))
                      })
                    }
                    className="min-h-11 flex-1 rounded-xl border border-live bg-live px-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? t('wait') : t('liftRideYes')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="min-h-11 rounded-xl border border-line px-3 text-sm">
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
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
