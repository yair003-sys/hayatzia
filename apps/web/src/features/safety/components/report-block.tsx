'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Flag, Ban } from 'lucide-react'
import { RIDE_HARM_HINT_HE, RIDE_HARM_REASON, RIDE_HARM_SENT_HE, reasonsFor, type REPORT_KINDS, type ReportReason } from '../schema'
import { blockAction, reportAction } from '../server/actions'

type Kind = (typeof REPORT_KINDS)[number]
type Props = { kind: Kind; refId: string; userId?: string; userNick?: string }

/**
 * The report form itself (reason + optional note), for any place that has its own "דווח" button (chat messages,
 * comments). Calls `onDone` with the line to show the fan (thanks, or what went wrong).
 */
export function ReportForm({ kind, refId, onDone, className }: { kind: Kind; refId: string; onDone: (msg: string) => void; className?: string }) {
  const t = useTranslations('safety')
  const reasons = reasonsFor(kind)
  const [reason, setReason] = useState<ReportReason>(reasons[0]!)
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  return (
    <form
      className={className ?? 'space-y-2 rounded-lg border border-line bg-surface p-3'}
      aria-label={t('reportFormAria')}
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await reportAction({ kind, ref: refId, reason, note })
          onDone(r.data?.ok ? (reason === RIDE_HARM_REASON ? RIDE_HARM_SENT_HE : t('thanksSent')) : (r.data?.error ?? t('reportFailed')))
        })
      }}
    >
      <label className="block text-sm">
        {t('reasonLabel')}
        <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="mt-1 w-full rounded-md border border-line bg-elev px-3 py-2">
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      {reason === RIDE_HARM_REASON && <p className="text-xs font-semibold text-live">{RIDE_HARM_HINT_HE}</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={t('notePlaceholder')} aria-label={t('noteLabel')} className="w-full rounded-md border border-line bg-elev px-3 py-2 text-sm" />
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg bg-live py-2 text-sm font-semibold text-white">
        {t('submitReport')}
      </button>
    </form>
  )
}

/** "Report" (to moderators) and, when there is a person, "Block". */
export function ReportBlock({ kind, refId, userId, userNick }: Props) {
  const t = useTranslations('safety')
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-muted">
          <Flag className="size-3.5" aria-hidden="true" />
          {t('reportButton')}
        </button>
        {userId && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await blockAction({ userId, on: true })
                setMsg(r.data?.ok ? t('blocked', { nick: userNick ?? t('defaultFan') }) : (r.data?.error ?? t('blockFailed')))
              })
            }
            className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-muted"
          >
            <Ban className="size-3.5" aria-hidden="true" />
            {t('blockButton')}
          </button>
        )}
      </div>
      {open && (
        <ReportForm
          kind={kind}
          refId={refId}
          onDone={(m) => {
            setMsg(m)
            setOpen(false)
          }}
        />
      )}
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </div>
  )
}
