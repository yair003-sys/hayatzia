'use client'

import { useState, useTransition } from 'react'
import { Ban, Car, Check, EyeOff, RotateCcw, Trash2, Undo2, X } from 'lucide-react'
import { AUTO_HIDDEN_LABEL, BAN_DAYS, RIDE_URGENT_LABEL, isRemovable, isUrgentRide, kindLabel, reportsOnTarget, reportTime } from '../schema'
import type { QueueRow } from '../server/queries'
import { banUserAction, removeContentAction, restoreContentAction, setReportStatusAction } from '../server/actions'

type Pending = 'remove' | 'restore' | 'ban7' | 'banForever' | null

const CONFIRM: Record<Exclude<Pending, null>, { ask: string; yes: string }> = {
  remove: { ask: 'להסיר את התוכן? אי אפשר לבטל.', yes: 'כן, הסר' },
  restore: { ask: 'להחזיר את התוכן לכל האוהדים? הדיווחים הפתוחים עליו יידחו.', yes: 'כן, החזר' },
  ban7: { ask: `להשעות את האוהד מכתיבה ל־${BAN_DAYS} ימים?`, yes: 'כן, השעה' },
  banForever: { ask: 'להשעות את האוהד מכתיבה לצמיתות?', yes: 'כן, השעה לצמיתות' },
}

const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium disabled:opacity-50'

/** One report in the moderation queue, with its actions. Destructive ones ask once more, inline. */
export function ReportCard({ r }: { r: QueueRow }) {
  const [confirm, setConfirm] = useState<Pending>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const open = r.status === 'open'
  const isContact = r.kind === 'contact'
  const canRemove = open && r.target_exists && isRemovable(r.kind)
  // Hidden by the database after many reports: the admin decides, remove it or put it back.
  const hidden = r.target_exists && r.target_hidden
  const canRestore = open && hidden && isRemovable(r.kind)
  const canBan = open && !isContact && r.target_user_id !== null

  const run = (fn: () => Promise<{ data?: { error?: string; ok?: true } | undefined; serverError?: string }>, done: string) =>
    start(async () => {
      const res = await fn()
      setConfirm(null)
      setMsg(res.data?.ok ? done : (res.data?.error ?? res.serverError ?? 'הפעולה נכשלה. נסה שוב'))
    })

  const doConfirmed = () => {
    const kind = r.kind
    if (confirm === 'remove' && isRemovable(kind)) run(() => removeContentAction({ kind, ref: r.ref }), 'התוכן הוסר')
    if (confirm === 'restore' && isRemovable(kind)) run(() => restoreContentAction({ kind, ref: r.ref }), 'התוכן הוחזר')
    if ((confirm === 'ban7' || confirm === 'banForever') && r.target_user_id) {
      const userId = r.target_user_id
      run(() => banUserAction({ userId, days: confirm === 'ban7' ? BAN_DAYS : null, reason: r.reason }), 'האוהד הושעה')
    }
  }

  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-labelledby={`rep-${r.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`rep-${r.id}`} className="font-semibold">
          {kindLabel(r.kind)} · {r.reason}
        </h3>
        <time dateTime={r.created_at} className="text-xs text-dim">
          {reportTime(r.created_at)}
        </time>
      </header>

      {isUrgentRide(r) && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-xs font-bold text-white">
          <Car className="size-3.5" aria-hidden="true" />
          {RIDE_URGENT_LABEL}
        </p>
      )}
      {hidden && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-semibold text-warn">
          <EyeOff className="size-3.5" aria-hidden="true" />
          {AUTO_HIDDEN_LABEL}
        </p>
      )}
      {r.target_preview !== null && (
        <p className="rounded-xl bg-elev p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{r.target_preview}</p>
      )}
      {r.note && <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted">„{r.note}”</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-dim">{isContact ? 'פונה' : 'מדווח'}</dt>
        <dd>{r.reporter_nick ?? 'חשבון שנמחק'}</dd>
        {r.reporter_contact && (
          <>
            <dt className="text-dim">חזרה אל</dt>
            <dd dir="ltr" className="text-end">
              {r.reporter_contact}
            </dd>
          </>
        )}
        {!isContact && (
          <>
            <dt className="text-dim">על</dt>
            <dd>{r.target_nick ?? (r.target_exists ? 'אוהד' : 'התוכן כבר לא קיים')}</dd>
          </>
        )}
      </dl>
      {!isContact && r.open_reports_on_target > 0 && <p className="text-xs font-semibold text-warn">{reportsOnTarget(r.open_reports_on_target)}</p>}

      {confirm ? (
        <div role="group" aria-label="אישור" className="space-y-2 rounded-xl border border-live/40 p-3">
          <p className="text-sm font-medium">{CONFIRM[confirm].ask}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={doConfirmed} className={`${btn} flex-1 border-live bg-live text-white`}>
              {busy ? 'רגע…' : CONFIRM[confirm].yes}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className={btn}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canRemove && (
            <button type="button" disabled={busy} onClick={() => setConfirm('remove')} className={`${btn} text-live`}>
              <Trash2 className="size-4" aria-hidden="true" />
              הסר תוכן
            </button>
          )}
          {canRestore && (
            <button type="button" disabled={busy} onClick={() => setConfirm('restore')} className={btn}>
              <Undo2 className="size-4" aria-hidden="true" />
              החזר תוכן
            </button>
          )}
          {canBan && (
            <>
              <button type="button" disabled={busy} onClick={() => setConfirm('ban7')} className={btn}>
                <Ban className="size-4" aria-hidden="true" />
                השעה ל־{BAN_DAYS} ימים
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirm('banForever')} className={btn}>
                <Ban className="size-4" aria-hidden="true" />
                השעה לצמיתות
              </button>
            </>
          )}
          {open ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setReportStatusAction({ reportId: r.id, status: 'handled' }), 'סומן כטופל')}
                className={btn}
              >
                <Check className="size-4" aria-hidden="true" />
                סמן כטופל
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setReportStatusAction({ reportId: r.id, status: 'dismissed' }), 'הדיווח נדחה')}
                className={btn}
              >
                <X className="size-4" aria-hidden="true" />
                דחה דיווח
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setReportStatusAction({ reportId: r.id, status: 'open' }), 'הוחזר לפתוחים')}
              className={btn}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              החזר לפתוחים
            </button>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm text-muted">
          {msg}
        </p>
      )}
    </article>
  )
}
