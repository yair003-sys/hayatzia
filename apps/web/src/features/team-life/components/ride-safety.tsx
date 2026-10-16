'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Share2, ShieldCheck, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { birthDateSchema } from '@/features/first-run/schema'
import { setBirthDateAction } from '@/features/profile/server/actions'
import { BirthDateFields } from '@/features/profile/components/birth-date-fields'
import {
  EMERGENCY_NUMBERS,
  GENDER,
  GENDER_NOTE,
  RIDES_ADULT_ONLY,
  RIDES_NEED_BIRTH_DATE,
  SAFETY_TIPS,
  shareText,
  type Gender,
  type RideAge,
} from '../ride-safety'
import { confirmRideSafetyAction, rateRideAction, setGenderAction } from '../server/actions'
import type { RideToRate } from '../server/queries'

/** The emergency numbers, always as visible text, each also a tel: link (44px). */
export function EmergencyNumbers({ className }: { className?: string }) {
  return (
    <ul className={cn('space-y-1.5', className)} aria-label="מספרי חירום">
      {EMERGENCY_NUMBERS.map((e) => (
        <li key={e.number}>
          <a href={`tel:${e.number}`} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm">
            <Phone className="size-4 shrink-0" aria-hidden="true" />
            <b dir="ltr" className="t-num">
              {e.number}
            </b>
            <span>{e.label}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * Before the first ride (offer or request): safety tips and emergency numbers (ride safety, rules 2 and 8). Since
 * 2026-10-16 18+ comes from the birth date: an adult just continues; under 18 sees that rides are 18+; a fan with no
 * birth date is asked for it here. The database refuses rides either way.
 */
export function SafetyGate({ age, onDone, onCancel }: { age: RideAge; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-lg border border-accent bg-surface p-3">
      <h2 id={titleId} className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5 text-accent-text" aria-hidden="true" />
        לפני הנסיעה הראשונה
      </h2>
      {age === 'minor' ? (
        <p className="text-sm">{RIDES_ADULT_ONLY}</p>
      ) : age === 'none' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{RIDES_NEED_BIRTH_DATE}</p>
          <BirthDateFields onChange={setBirthDate} />
        </div>
      ) : (
        <>
          <ul className="list-disc space-y-1 ps-5 text-sm leading-relaxed">
            {SAFETY_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="text-sm font-semibold">בחירום או אחרי פגיעה:</p>
          <EmergencyNumbers />
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {age === 'adult' && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await confirmRideSafetyAction({})
                if (r?.data && 'ok' in r.data) {
                  router.refresh()
                  onDone()
                } else setError((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? 'לא הצלחנו לשמור. נסה שוב')
              })
            }
            className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
          >
            הבנתי, אפשר להמשיך
          </button>
        )}
        {age === 'none' && (
          <button
            type="button"
            disabled={pending || !birthDate}
            onClick={() =>
              start(async () => {
                const parsed = birthDateSchema.safeParse(birthDate)
                if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'התאריך לא תקין')
                const r = await setBirthDateAction({ birthDate: parsed.data })
                if (r?.data && 'ok' in r.data) {
                  setError(null)
                  router.refresh() // the gate comes back as adult or under 18
                } else setError((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? 'השמירה נכשלה. נסה שוב')
              })
            }
            className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
          >
            שמירת תאריך הלידה
          </button>
        )}
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4">
          {age === 'minor' ? 'סגירה' : 'לא עכשיו'}
        </button>
      </div>
    </section>
  )
}

/** "שתף את הנסיעה": Web Share when there is one, else the text is copied (rule 7). */
export function ShareRide(p: Omit<Parameters<typeof shareText>[0], 'url'> & { tripId: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const share = async () => {
    const url = `${window.location.origin}/stand/trips?trip=${p.tripId}`
    const text = shareText({ ...p, url })
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'הנסיעה שלי למשחק', text })
        return
      }
      await navigator.clipboard.writeText(text)
      setMsg('פרטי הנסיעה הועתקו. אפשר להדביק ולשלוח')
    } catch (e) {
      // The fan closed the share sheet: nothing to say.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setMsg('לא הצלחנו לשתף. נסה שוב')
    }
  }
  return (
    <>
      <button type="button" onClick={() => void share()} className="flex min-h-11 items-center gap-1 rounded-full border border-line px-3 text-xs">
        <Share2 className="size-3.5" aria-hidden="true" />
        שתף את הנסיעה
      </button>
      {msg && (
        <span role="status" className="text-xs text-muted">
          {msg}
        </span>
      )}
    </>
  )
}

const DAY = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' })

/** After the match, accepted riders rate the driver once (rule 6). */
export function RateRides({ rides }: { rides: RideToRate[] }) {
  if (rides.length === 0) return null
  return (
    <section aria-label="דירוג נסיעות" className="space-y-2">
      {rides.map((r) => (
        <RateOne key={r.tripId} ride={r} />
      ))}
    </section>
  )
}

function RateOne({ ride }: { ride: RideToRate }) {
  const [stars, setStars] = useState(0)
  const [state, setState] = useState<'idle' | 'done' | string>('idle')
  const [pending, start] = useTransition()
  const router = useRouter()
  if (state === 'done') {
    return (
      <p role="status" className="rounded-lg bg-surface p-3 text-sm text-muted">
        תודה על הדירוג.
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-medium">
        איך הייתה הנסיעה עם {ride.driverNick} ({DAY.format(new Date(ride.kickoffAt))})?
      </p>
      <div role="radiogroup" aria-label="דירוג מ־1 עד 5" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} כוכבים`}
            onClick={() => setStars(n)}
            className="flex size-11 items-center justify-center rounded-full"
          >
            <Star className={cn('size-6', n <= stars ? 'fill-warn text-warn' : 'text-dim')} aria-hidden="true" />
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={stars === 0 || pending}
        onClick={() =>
          start(async () => {
            const r = await rateRideAction({ tripId: ride.tripId, stars })
            if (r.data?.ok) {
              setState('done')
              router.refresh()
            } else setState(r.data?.error ?? r.serverError ?? 'הדירוג לא נשמר. נסה שוב')
          })
        }
        className="min-h-11 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
      >
        שלח דירוג
      </button>
      <p className="text-xs text-muted">אם קרה משהו בנסיעה, דווחו מכרטיס הנסיעה: „הטרדה או פגיעה בנסיעה”.</p>
      {state !== 'idle' && (
        <p role="alert" className="text-sm text-live">
          {state}
        </p>
      )}
    </div>
  )
}

/** "הכרטיס שלי": self-declared gender, shown only in rides (rule 1). */
export function GenderPicker({ initial }: { initial: Gender | null }) {
  const [value, setValue] = useState<Gender | null>(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const titleId = useId()
  return (
    <fieldset aria-describedby={`${titleId}-note`} className="space-y-2 rounded-2xl border border-line p-3">
      <legend id={titleId} className="px-1 text-sm font-medium">
        בנסיעות אני
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(GENDER) as Gender[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={value === g}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setGenderAction({ gender: g })
                if (r.data?.ok) {
                  setValue(g)
                  setMsg('נשמר')
                } else setMsg(r.data?.error ?? r.serverError ?? 'לא הצלחנו לשמור. נסה שוב')
              })
            }
            className={cn('min-h-11 rounded-xl border text-sm', value === g ? 'border-accent bg-accent-soft font-semibold' : 'border-line text-muted')}
          >
            {GENDER[g]}
          </button>
        ))}
      </div>
      <p id={`${titleId}-note`} className="text-xs text-dim">
        {GENDER_NOTE}
      </p>
      {msg && (
        <p role="status" className="text-xs text-muted">
          {msg}
        </p>
      )}
    </fieldset>
  )
}
