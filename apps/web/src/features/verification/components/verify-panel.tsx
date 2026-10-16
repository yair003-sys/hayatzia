'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Car, IdCard, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEMO_LABEL, VERIFY_KIND_LABEL, VERIFY_PRIVACY_NOTE, formatPlate, statusLabel, type VerifyKind } from '../schema'
import type { KindState, MyVerification } from '../server/queries'
import { registerCarAction, removeCarAction, startVerificationAction } from '../server/actions'

type Result = { data?: { ok?: true; error?: string; url?: string }; serverError?: string; validationErrors?: unknown } | undefined
const errorOf = (r: Result) => r?.data?.error ?? r?.serverError ?? (r?.validationErrors ? 'בדוק את הפרטים' : null)

/** "אימות לנסיעות" (2026-10-16): ID + face scan for everyone, licence and car for drivers. */
export function VerifyPanel({ v }: { v: MyVerification }) {
  const identityOk = v.identity.status === 'approved'
  const licenceOk = v.licence.status === 'approved'
  return (
    <div className="space-y-4">
      {v.demo && (
        <p role="note" className="rounded-lg border border-warn/60 bg-surface p-3 text-sm font-medium text-warn">
          {DEMO_LABEL}
        </p>
      )}
      <p className="text-sm text-muted">
        {v.required ? 'כדי להציע או לבקש נסיעה צריך לאמת זהות. נהגים מאמתים גם רישיון נהיגה ורושמים רכב.' : 'האימות עוד לא חובה בנסיעות. אפשר להתחיל כבר עכשיו.'}
      </p>
      <KindCard kind="identity" state={v.identity} available={v.available} icon={<IdCard className="size-5" aria-hidden="true" />} />
      <KindCard
        kind="licence"
        state={v.licence}
        available={v.available}
        blocked={identityOk ? null : 'קודם מאמתים תעודה מזהה'}
        icon={<BadgeCheck className="size-5" aria-hidden="true" />}
      />
      <CarCard car={v.car} hint={licenceOk ? null : 'הרכב נדרש רק לנהגים'} />
      <p className="flex gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        {VERIFY_PRIVACY_NOTE}
      </p>
    </div>
  )
}

function KindCard({
  kind,
  state,
  available,
  blocked = null,
  icon,
}: {
  kind: VerifyKind
  state: KindState
  available: boolean
  blocked?: string | null
  icon: ReactNode
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const done = state.status === 'approved'
  const canStart = available && !done && !blocked && state.left > 0
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3" aria-label={VERIFY_KIND_LABEL[kind]}>
      <h2 className="flex items-center gap-2 font-semibold">
        {icon}
        {VERIFY_KIND_LABEL[kind]}
      </h2>
      <p className={cn('text-sm', done ? 'font-semibold text-ok' : state.status === 'rejected' ? 'text-live' : 'text-muted')}>
        {statusLabel(state.status, state.reason)}
      </p>
      {!done && (
        <p className="text-xs text-muted">{state.left > 0 ? `נשארו ${state.left} ניסיונות` : 'נגמרו הניסיונות. כתבו לנו ב„צור קשר” ונאפס'}</p>
      )}
      {blocked && !done && <p className="text-xs text-muted">{blocked}</p>}
      {!available && !done && <p className="text-xs text-muted">האימות עוד לא זמין. נעדכן כשייפתח.</p>}
      {canStart && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = (await startVerificationAction({ kind })) as Result
              const e = errorOf(r)
              setError(e)
              if (!e && r?.data?.url) window.location.assign(r.data.url)
            })
          }
          className="min-h-11 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
        >
          {pending ? 'רגע…' : state.status === 'none' ? 'התחלת אימות' : 'אימות מחדש'}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </section>
  )
}

function CarCard({ car, hint }: { car: MyVerification['car']; hint: string | null }) {
  const router = useRouter()
  const [plate, setPlate] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const e = errorOf(await fn())
      setError(e)
      if (!e) {
        after?.()
        router.refresh()
      }
    })
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3" aria-label="הרכב שלי">
      <h2 className="flex items-center gap-2 font-semibold">
        <Car className="size-5" aria-hidden="true" />
        הרכב שלי
      </h2>
      {hint && !car && <p className="text-xs text-muted">{hint}</p>}
      {car ? (
        <div className="space-y-2">
          <p className="text-sm">
            {[car.make, car.model].filter(Boolean).join(' ')}
            {car.colour ? ` · ${car.colour}` : ''}
            {car.year ? ` · ${car.year}` : ''}
          </p>
          <p className="text-sm">
            מספר רכב:{' '}
            <b dir="ltr" className="t-num">
              {formatPlate(car.plate)}
            </b>{' '}
            <span className="text-xs text-muted">(רק נוסעים שאישרת רואים)</span>
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => removeCarAction({}) as Promise<Result>)}
            className="min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-40"
          >
            הסרת הרכב
          </button>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => registerCarAction({ plate }) as Promise<Result>, () => setPlate(''))
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-muted">מספר רכב</span>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              required
              maxLength={12}
              placeholder="12-345-67"
              className="w-full rounded-md border border-line bg-elev px-3 py-2"
            />
          </label>
          <p className="text-xs text-muted">נבדוק את המספר במאגר הפתוח של משרד התחבורה. בכרטיס הנסיעה יופיעו היצרן, הדגם והצבע.</p>
          <button type="submit" disabled={pending || !plate.trim()} className="min-h-11 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40">
            {pending ? 'בודקים…' : 'בדיקה ורישום'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </section>
  )
}
