'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Phone, Share2, ShieldCheck, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { birthDateSchema } from '@/features/first-run/schema'
import { setBirthDateAction } from '@/features/profile/server/actions'
import { BirthDateFields } from '@/features/profile/components/birth-date-fields'
import {
  EMERGENCY_NUMBERS,
  GENDER,
  GENDER_LOCKED_HE,
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
  const tl = useTranslations('teamLife')
  return (
    <ul className={cn('space-y-1.5', className)} aria-label={tl('emergencyNumbers')}>
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
  const tl = useTranslations('teamLife')
  const [error, setError] = useState<string | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-lg border border-accent bg-surface p-3">
      <h2 id={titleId} className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5 text-accent-text" aria-hidden="true" />
        {tl('beforeFirstRide')}
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
          <p className="text-sm font-semibold">{tl('inEmergency')}</p>
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
                } else setError((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? tl('saveFailedRetry'))
              })
            }
            className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
          >
            {tl('understood')}
          </button>
        )}
        {age === 'none' && (
          <button
            type="button"
            disabled={pending || !birthDate}
            onClick={() =>
              start(async () => {
                const parsed = birthDateSchema.safeParse(birthDate)
                if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? tl('dateInvalid'))
                const r = await setBirthDateAction({ birthDate: parsed.data })
                if (r?.data && 'ok' in r.data) {
                  setError(null)
                  router.refresh() // the gate comes back as adult or under 18
                } else setError((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? tl('saveFailed2'))
              })
            }
            className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
          >
            {tl('saveBirthDate')}
          </button>
        )}
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4">
          {age === 'minor' ? tl('close') : tl('notNow')}
        </button>
      </div>
    </section>
  )
}

/** "שתף את הנסיעה": Web Share when there is one, else the text is copied (rule 7). */
export function ShareRide(p: Omit<Parameters<typeof shareText>[0], 'url'> & { tripId: string }) {
  const tl = useTranslations('teamLife')
  const [msg, setMsg] = useState<string | null>(null)
  const share = async () => {
    const url = `${window.location.origin}/stand/trips?trip=${p.tripId}`
    const text = shareText({ ...p, url })
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: tl('myRideTitle'), text })
        return
      }
      await navigator.clipboard.writeText(text)
      setMsg(tl('rideCopied'))
    } catch (e) {
      // The fan closed the share sheet: nothing to say.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setMsg(tl('shareFailed'))
    }
  }
  return (
    <>
      <button type="button" onClick={() => void share()} className="flex min-h-11 items-center gap-1 rounded-full border border-line px-3 text-xs">
        <Share2 className="size-3.5" aria-hidden="true" />
        {tl('shareRide')}
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
  const tl = useTranslations('teamLife')
  if (rides.length === 0) return null
  return (
    <section aria-label={tl('rateRidesAria')} className="space-y-2">
      {rides.map((r) => (
        <RateOne key={r.tripId} ride={r} />
      ))}
    </section>
  )
}

function RateOne({ ride }: { ride: RideToRate }) {
  const tl = useTranslations('teamLife')
  const [stars, setStars] = useState(0)
  const [state, setState] = useState<'idle' | 'done' | string>('idle')
  const [pending, start] = useTransition()
  const router = useRouter()
  if (state === 'done') {
    return (
      <p role="status" className="rounded-lg bg-surface p-3 text-sm text-muted">
        {tl('thanksRating')}
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-medium">
        {tl('howWasRide', { nick: ride.driverNick, day: DAY.format(new Date(ride.kickoffAt)) })}
      </p>
      <div role="radiogroup" aria-label={tl('rate1to5')} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={tl('starsN', { n })}
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
            } else setState(r.data?.error ?? r.serverError ?? tl('ratingFailed'))
          })
        }
        className="min-h-11 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
      >
        {tl('sendRating')}
      </button>
      <p className="text-xs text-muted">{tl('rideReportNote')}</p>
      {state !== 'idle' && (
        <p role="alert" className="text-sm text-live">
          {state}
        </p>
      )}
    </div>
  )
}

/** "הכרטיס שלי": self-declared gender, shown only in rides (rule 1). Set once: after it holds a value the picker is
 *  read-only and a note sends the fan to support (the database refuses a change; the UI must not offer a dead end). */
export function GenderPicker({ initial }: { initial: Gender | null }) {
  const tl = useTranslations('teamLife')
  const [value, setValue] = useState<Gender | null>(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const titleId = useId()
  const locked = value !== null
  return (
    <fieldset aria-describedby={`${titleId}-note`} className="space-y-2 rounded-2xl border border-line p-3">
      <legend id={titleId} className="px-1 text-sm font-medium">
        {tl('inRidesIam')}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(GENDER) as Gender[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={value === g}
            disabled={pending || locked}
            onClick={() =>
              start(async () => {
                const r = await setGenderAction({ gender: g })
                if (r.data?.ok) {
                  setValue(g)
                  setMsg(tl('saved'))
                } else setMsg(r.data?.error ?? r.serverError ?? tl('saveFailedRetry'))
              })
            }
            className={cn(
              'min-h-11 rounded-xl border text-sm',
              value === g ? 'border-accent bg-accent-soft font-semibold' : 'border-line text-muted',
              locked && value !== g && 'opacity-40',
            )}
          >
            {GENDER[g]}
          </button>
        ))}
      </div>
      <p id={`${titleId}-note`} className="text-xs text-dim">
        {locked ? GENDER_LOCKED_HE : GENDER_NOTE}
      </p>
      {msg && (
        <p role="status" className="text-xs text-muted">
          {msg}
        </p>
      )}
    </fieldset>
  )
}
