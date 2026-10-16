'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { birthDateSchema } from '@/features/first-run/schema'
import { setBirthDateAction } from '../server/actions'
import { BirthDateFields } from './birth-date-fields'

const LATER_KEY = 'onefan:birth-date-later'

// "לא עכשיו" hides the sheet for this visit only (sessionStorage); it is asked again next time until given.
const laterListeners = new Set<() => void>()
function readLater(): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1'
  } catch {
    return false
  }
}
function setLater() {
  try {
    sessionStorage.setItem(LATER_KEY, '1')
  } catch {
    // storage blocked: the sheet just closes for now
  }
  laterListeners.forEach((l) => l())
}

/**
 * For fans who signed up before the birth date existed (2026-10-16): asked once per visit until given. Existing chats
 * keep working; new private chats and rides wait for it. Never shown to other fans.
 */
export function BirthDateSheet() {
  const later = useSyncExternalStore(
    (l) => {
      laterListeners.add(l)
      return () => laterListeners.delete(l)
    },
    readLater,
    () => true, // server: render nothing, the browser decides
  )
  const [closed, setClosed] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  if (later || closed) return null
  return (
    <div className="sq-sheet-wrap">
      <div className="sq-sheet ib-sheet space-y-3" role="dialog" aria-modal="true" aria-labelledby="birth-date-title">
        <span className="sq-grip" aria-hidden="true" />
        <h2 id="birth-date-title" className="t-sec">
          עוד פרט אחד: תאריך לידה
        </h2>
        <p className="text-sm text-muted">מעכשיו אפשר לכתוב לאוהדים מכל הליגה. כדי להגן על בני נוער, צריך תאריך לידה לפני שיחה חדשה או נסיעה.</p>
        <BirthDateFields onChange={setValue} />
        {error && (
          <p role="alert" className="text-sm text-live">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!value || pending}
            className="min-h-11 flex-1 rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
            onClick={() =>
              start(async () => {
                const parsed = birthDateSchema.safeParse(value)
                if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'התאריך לא תקין')
                const r = await setBirthDateAction({ birthDate: parsed.data })
                if (r?.data && 'ok' in r.data) {
                  setClosed(true)
                  router.refresh()
                } else setError((r?.data && 'error' in r.data ? r.data.error : r?.serverError) ?? 'השמירה נכשלה. נסה שוב')
              })
            }
          >
            {pending ? 'שומר…' : 'שמירה'}
          </button>
          <button type="button" className="min-h-11 rounded-lg border border-line px-4" onClick={setLater}>
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  )
}
