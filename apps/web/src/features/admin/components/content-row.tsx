'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { isRemovable, reportTime } from '../schema'
import type { ContentRow as Row } from '../server/queries'
import { removeChannelPostAction, removeContentAction } from '../server/actions'

/** One piece of content in the console feed, with a two-tap delete. Works for every kind, including club-news posts. */
export function ContentRow({ c }: { c: Row }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const [arming, setArming] = useState(false)
  const [busy, start] = useTransition()

  const finish = (ok: boolean, err?: string | null) => {
    if (ok) {
      setGone(true)
      setMsg('התוכן הוסר')
    } else {
      setMsg(err ?? 'הפעולה נכשלה. נסה שוב')
    }
  }

  const remove = () =>
    start(async () => {
      setArming(false)
      if (c.kind === 'channel_post') {
        const r = await removeChannelPostAction({ id: c.ref })
        finish(r.data?.ok ?? false, r.data?.error ?? r.serverError)
      } else if (isRemovable(c.kind)) {
        const r = await removeContentAction({ kind: c.kind, ref: c.ref })
        finish(r.data?.ok ?? false, r.data?.error ?? r.serverError)
      } else {
        finish(false, 'את התוכן הזה אי אפשר להסיר מכאן')
      }
    })

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 p-3">
      <div className="min-w-0 text-sm">
        <p className={`break-words ${gone ? 'text-dim line-through' : ''}`}>{c.preview || '—'}</p>
        <p className="text-xs text-dim">
          {c.author_nick ?? 'לא ידוע'} · {c.team_name} · {reportTime(c.created_at)}
          {c.hidden ? ' · מוסתר' : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {gone ? (
          <span className="text-xs text-dim">הוסר</span>
        ) : arming ? (
          <>
            <button type="button" disabled={busy} onClick={remove} className="min-h-11 rounded-xl bg-live px-3 text-sm font-medium text-white disabled:opacity-50">
              כן, מחק
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
            <Trash2 className="size-4" aria-hidden="true" />
            מחק
          </button>
        )}
      </div>
      {msg && (
        <p role="status" className="w-full text-xs text-muted">
          {msg}
        </p>
      )}
    </li>
  )
}
