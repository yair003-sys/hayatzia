'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { ShieldCheck, Ban, BadgeCheck, ChevronLeft } from 'lucide-react'
import { banUntilLabel, joinedLabel } from '../schema'
import type { UserRow as Row } from '../server/queries'
import { banUserAction, unbanUserAction } from '../server/actions'

/** One fan in the console user list, with a two-tap suspend / lift-suspension control. Admins show no control. */
export function UserRow({ u }: { u: Row }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [arming, setArming] = useState(false)
  const [busy, start] = useTransition()

  const ban = () =>
    start(async () => {
      setArming(false)
      const r = await banUserAction({ userId: u.user_id, days: null, reason: '' })
      setMsg(r.data?.ok ? 'האוהד הושעה מכתיבה' : (r.data?.error ?? r.serverError ?? 'הפעולה נכשלה. נסה שוב'))
    })
  const unban = () =>
    start(async () => {
      const r = await unbanUserAction({ userId: u.user_id })
      setMsg(r.data?.ok ? 'ההשעיה בוטלה' : (r.data?.error ?? r.serverError ?? 'הפעולה נכשלה. נסה שוב'))
    })

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3">
      <Link href={`/admin/users/${u.user_id}` as Route} className="-m-1 flex min-w-0 flex-1 items-center gap-1 rounded-lg p-1 text-sm hover:bg-accent-soft">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {u.nick}
            {u.is_admin && <ShieldCheck className="size-4 shrink-0 text-accent" aria-label="מנהל" />}
            {u.verified && <BadgeCheck className="size-4 shrink-0 text-muted" aria-label="מאומת 18+" />}
          </span>
          <span className="block text-xs text-dim">
            {u.team_name} · נרשם {joinedLabel(u.created_at)}
            {u.banned ? ` · מושעה (${banUntilLabel(u.ban_until)})` : ''}
          </span>
        </span>
        <ChevronLeft className="size-4 shrink-0 text-dim" aria-hidden="true" />
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {u.is_admin ? (
          <span className="text-xs text-dim">מנהל</span>
        ) : u.banned ? (
          <button type="button" disabled={busy} onClick={unban} className="min-h-11 rounded-xl border border-line px-3 text-sm disabled:opacity-50">
            בטל השעיה
          </button>
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
            השעה
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
