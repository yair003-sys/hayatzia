'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { verifyCodeHe } from '@/features/verification/schema'
import { reportTime } from '../schema'
import type { VerificationIssueRow } from '../server/queries'
import { fixBirthDateAction, resetVerificationAction } from '../server/actions'

/**
 * Fans stuck in ride verification (2026-10-16): the latest attempt was rejected, or all three attempts are used.
 * "אפס ניסיונות" gives three new attempts; "תקן תאריך לידה" resolves dob_mismatch after checking the document with the
 * fan (both logged in "פעולות אחרונות").
 */
export function VerificationIssueList({ rows }: { rows: VerificationIssueRow[] }) {
  const t = useTranslations('admin')
  const KIND = { identity: t('vkIdentity'), licence: t('vkLicence') } as const
  const [msg, setMsg] = useState<string | null>(null)
  const [dates, setDates] = useState<Record<string, string>>({})
  const [busy, start] = useTransition()
  if (rows.length === 0) return <p className="text-sm text-muted">{t('noStuck')}</p>
  const run = (fn: () => Promise<{ data?: { ok?: true; error?: string }; serverError?: string } | undefined>, done: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r?.data?.ok ? done : (r?.data?.error ?? r?.serverError ?? t('actionFailed')))
    })
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((r) => {
          const key = `${r.user_id}:${r.kind}`
          const kind = r.kind === 'licence' ? 'licence' : 'identity'
          return (
            <li key={key} className="space-y-2 p-3 text-sm">
              <p>
                <b>{r.nick ?? t('fan')}</b> · {KIND[kind]} · {t('attemptsOfThree', { used: r.used })} · {reportTime(r.created_at)}
              </p>
              {r.reason_code && <p className="text-xs text-muted">{verifyCodeHe(r.reason_code) ?? r.reason_code}</p>}
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => resetVerificationAction({ userId: r.user_id, kind }), t('attemptsReset'))}
                  className="min-h-11 rounded-xl border border-line px-3 disabled:opacity-50"
                >
                  {t('resetAttempts')}
                </button>
                {r.reason_code === 'dob_mismatch' && (
                  <>
                    <label className="space-y-1">
                      <span className="block text-xs text-muted">{t('correctDobLabel')}</span>
                      <input
                        type="date"
                        value={dates[key] ?? ''}
                        onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))}
                        className="min-h-11 rounded-xl border border-line bg-elev px-3"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !dates[key]}
                      onClick={() => run(() => fixBirthDateAction({ userId: r.user_id, birthDate: dates[key] ?? '' }), t('dobFixed'))}
                      className="min-h-11 rounded-xl border border-line px-3 disabled:opacity-50"
                    >
                      {t('fixDob')}
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {msg && (
        <p role="status" className="text-sm text-muted">
          {msg}
        </p>
      )}
    </div>
  )
}
