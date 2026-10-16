'use client'

import { useState, useTransition } from 'react'
import { INCIDENTS_NOTE, reportTime } from '../schema'
import type { IncidentRow } from '../server/queries'
import { ackIncidentAction, closeIncidentAction } from '../server/actions'

/**
 * "אירועי חירום פתוחים" (2026-10-16): who pressed the emergency button, from where, when and in which car. "קיבלתי"
 * clears the badge; "סגור אירוע" ends the case (until then the trip and its requests cannot be deleted).
 */
export function IncidentList({ rows }: { rows: IncidentRow[] }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const run = (fn: () => Promise<{ data?: { ok?: true; error?: string }; serverError?: string } | undefined>, done: string) =>
    start(async () => {
      const r = await fn()
      setConfirm(null)
      setMsg(r?.data?.ok ? done : (r?.data?.error ?? r?.serverError ?? 'הפעולה נכשלה. נסה שוב'))
    })
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{INCIDENTS_NOTE}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">אין אירועי חירום פתוחים.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-live/50 bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {!r.acknowledged_at && <span className="rounded-full bg-live px-2 py-0.5 text-xs font-bold text-white">חדש</span>}
                <time dateTime={r.created_at} className="text-dim">
                  {reportTime(r.created_at)}
                </time>
                <span className="font-medium">
                  {r.from_city}
                  {r.pickup ? ` · איסוף: ${r.pickup}` : ''}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-muted">דיווח</dt>
                <dd>{r.reporter_nick ?? 'אוהד'}</dd>
                <dt className="text-muted">נהג</dt>
                <dd>{r.driver_nick ?? 'לא ידוע'}</dd>
                <dt className="text-muted">רכב</dt>
                <dd dir="auto">{r.car || 'לא רשום'}</dd>
                {r.kickoff_at && (
                  <>
                    <dt className="text-muted">משחק</dt>
                    <dd>{reportTime(r.kickoff_at)}</dd>
                  </>
                )}
              </dl>
              {confirm === r.id ? (
                <div role="group" aria-label="אישור" className="space-y-2 rounded-xl border border-line p-3">
                  <p className="text-sm font-medium">לסגור את האירוע? אחרי הסגירה אפשר שוב למחוק את הנסיעה. סוגרים רק אחרי שהבירור הסתיים.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => closeIncidentAction({ id: r.id }), 'האירוע נסגר')}
                      className="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm font-medium disabled:opacity-50"
                    >
                      כן, לסגור
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="min-h-11 rounded-xl border border-line px-3 text-sm">
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {!r.acknowledged_at && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => ackIncidentAction({ id: r.id }), 'סומן שקיבלת')}
                      className="min-h-11 rounded-xl bg-live px-3 text-sm font-medium text-white disabled:opacity-50"
                    >
                      קיבלתי
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm(r.id)}
                    className="min-h-11 rounded-xl border border-line px-3 text-sm disabled:opacity-50"
                  >
                    סגור אירוע
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <p role="status" className="text-sm text-muted">
          {msg}
        </p>
      )}
    </div>
  )
}
