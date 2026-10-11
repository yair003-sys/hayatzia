'use client'

import { useState, useTransition } from 'react'
import { Flag, Ban } from 'lucide-react'
import { REPORT_REASONS, type REPORT_KINDS } from '../schema'
import { blockAction, reportAction } from '../server/actions'

type Props = { kind: (typeof REPORT_KINDS)[number]; refId: string; userId?: string; userNick?: string }

/** "Report" (to moderators) and, when there is a person, "Block". */
export function ReportBlock({ kind, refId, userId, userNick }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>(REPORT_REASONS[0])
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-muted">
          <Flag className="size-3.5" aria-hidden="true" />
          דיווח
        </button>
        {userId && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await blockAction({ userId, on: true })
                setMsg(r.data?.ok ? `חסמת את ${userNick ?? 'האוהד'}. הוא לא יוכל לשלוח לך הודעות.` : (r.data?.error ?? 'לא הצלחנו'))
              })
            }
            className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-muted"
          >
            <Ban className="size-3.5" aria-hidden="true" />
            חסימה
          </button>
        )}
      </div>
      {open && (
        <form
          className="space-y-2 rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await reportAction({ kind, ref: refId, reason, note })
              setMsg(r.data?.ok ? 'תודה. הדיווח הגיע לצוות.' : (r.data?.error ?? 'הדיווח לא נשלח'))
              setOpen(false)
            })
          }}
        >
          <label className="block text-sm">
            סיבה
            <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="mt-1 w-full rounded-md border border-line bg-elev px-3 py-2">
              {REPORT_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="פרטים (לא חובה)" aria-label="פרטים" className="w-full rounded-md border border-line bg-elev px-3 py-2 text-sm" />
          <button type="submit" disabled={pending} className="w-full rounded-lg bg-live py-2 text-sm font-semibold text-white">
            שלח דיווח
          </button>
        </form>
      )}
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </div>
  )
}
