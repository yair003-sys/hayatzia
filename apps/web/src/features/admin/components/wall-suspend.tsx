'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { banUntilLabel } from '../schema'
import { banUserAction, unbanUserAction } from '../server/actions'

/** Suspend / lift-suspension for one fan, on their wall header. Admins are never shown a control. */
export function WallSuspend({ userId, banned, banUntil, isAdmin }: { userId: string; banned: boolean; banUntil: string | null; isAdmin: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [arming, setArming] = useState(false)
  const [busy, start] = useTransition()
  const router = useRouter()

  if (isAdmin) return <span className="text-xs text-dim">מנהל — לא ניתן להשעיה</span>

  const ban = () =>
    start(async () => {
      setArming(false)
      const r = await banUserAction({ userId, days: null, reason: '' })
      if (r.data?.ok) router.refresh()
      setMsg(r.data?.ok ? 'האוהד הושעה מכתיבה' : (r.data?.error ?? r.serverError ?? 'הפעולה נכשלה. נסה שוב'))
    })
  const unban = () =>
    start(async () => {
      const r = await unbanUserAction({ userId })
      if (r.data?.ok) router.refresh()
      setMsg(r.data?.ok ? 'ההשעיה בוטלה' : (r.data?.error ?? r.serverError ?? 'הפעולה נכשלה. נסה שוב'))
    })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {banned ? (
        <>
          <span className="rounded-full border border-live/40 px-2 py-0.5 text-xs font-medium text-live">מושעה · {banUntilLabel(banUntil)}</span>
          <button type="button" disabled={busy} onClick={unban} className="min-h-11 rounded-xl border border-line px-3 text-sm disabled:opacity-50">
            בטל השעיה
          </button>
        </>
      ) : arming ? (
        <>
          <button type="button" disabled={busy} onClick={ban} className="min-h-11 rounded-xl bg-live px-3 text-sm font-medium text-white disabled:opacity-50">
            כן, השעה
          </button>
          <button type="button" disabled={busy} onClick={() => setArming(false)} className="min-h-11 rounded-xl border border-line px-3 text-sm">
            ביטול
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setArming(true)}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm disabled:opacity-50"
        >
          <Ban className="size-4" aria-hidden="true" />
          השעה מכתיבה
        </button>
      )}
      {msg && (
        <span role="status" className="w-full text-xs text-muted">
          {msg}
        </span>
      )}
    </div>
  )
}
