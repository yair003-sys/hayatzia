'use client'

import { useState, useTransition } from 'react'
import { PenSquare } from 'lucide-react'
import { openThreadAction, searchTeammatesAction } from '../server/actions'

export function NewConversation() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [fans, setFans] = useState<{ user_id: string; nick: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const search = (value: string) => {
    setQ(value)
    start(async () => setFans((await searchTeammatesAction({ q: value })).data?.fans ?? []))
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          search('')
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 font-semibold text-white"
      >
        <PenSquare className="size-5" aria-hidden="true" />
        שיחה חדשה
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="חפש אוהד מהקבוצה לפי כינוי"
        aria-label="חיפוש אוהד"
        className="w-full rounded-md border border-line bg-elev px-3 py-2"
      />
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {fans?.map((f) => (
          <li key={f.user_id}>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await openThreadAction({ otherId: f.user_id })
                  if (r?.data?.error) setError(r.data.error)
                })
              }
              className="w-full rounded-md px-3 py-2 text-start hover:bg-surface-2"
            >
              {f.nick}
            </button>
          </li>
        ))}
        {fans && fans.length === 0 && <li className="px-3 py-2 text-sm text-muted">לא נמצאו אוהדים</li>}
      </ul>
      {error && <p role="alert" className="text-sm text-live">{error}</p>}
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
        סגור
      </button>
    </div>
  )
}
