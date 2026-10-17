'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { checkinErrorHe } from '../schema'
import { checkInAction } from '../server/actions'

type Stub = { number: number; away: boolean; stadium: string }

/** A short double-buzz on a successful check-in. Guarded for SSR and phones without a vibrator; never throws. */
function buzz() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([0, 60, 40, 90])
  } catch {
    // haptics are optional; nothing else depends on them
  }
}

/** "📍 הייתי שם": asks the phone for its location; the server checks it is within 500 m of the stadium.
 *  `haptics` (stadium design only, default off) adds a short buzz on success; classic callers leave it off. */
export function CheckinButton({ fixtureId, done, label, haptics = false }: { fixtureId: number; done: boolean; label: string; haptics?: boolean }) {
  const [state, setState] = useState<'idle' | 'locating' | 'done'>(done ? 'done' : 'idle')
  const [stub, setStub] = useState<Stub | null>(null)
  const [error, setError] = useState<string | null>(null)

  const go = () => {
    setError(null)
    if (!('geolocation' in navigator)) return setError('הטלפון לא נותן מיקום')
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await checkInAction({ fixtureId, lat: pos.coords.latitude, lng: pos.coords.longitude })
        if (r.data && 'number' in r.data) {
          if (haptics) buzz()
          setStub(r.data)
          setState('done')
        } else {
          setError((r.data && 'error' in r.data && r.data.error) || 'הצ׳ק-אין לא הצליח')
          setState('idle')
        }
      },
      (e) => {
        setError(checkinErrorHe(e.code === e.PERMISSION_DENIED ? 'denied' : 'x'))
        setState('idle')
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    )
  }

  return (
    <div className="space-y-2">
      {state === 'done' && !stub ? (
        <p className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-ok/35 bg-ok/10 font-bold text-ok">✓ הייתי שם</p>
      ) : state !== 'done' ? (
        <button
          type="button"
          onClick={go}
          disabled={state === 'locating'}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_10px_26px_-10px_var(--acc,#0066ff)] disabled:opacity-60"
          style={{ background: 'linear-gradient(180deg, var(--acc2, #3385ff), var(--acc, #0066ff))', color: 'var(--acc-on, #fff)' }}
        >
          <MapPin className="size-5" aria-hidden="true" />
          {state === 'locating' ? 'בודק מיקום…' : `הייתי שם · צ׳ק-אין ${label}`}
        </button>
      ) : null}
      {stub && (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2 p-4 text-center motion-safe:animate-pop" role="status">
          <span className="text-[11px] font-bold tracking-widest text-muted">כרטיס נוכחות</span>
          <p className="t-sec">✓ הייתי שם</p>
          <p className="text-sm text-muted">
            {stub.stadium} · {new Date().toLocaleDateString('he-IL')}
            {stub.away ? ' · משחק חוץ' : ''}
          </p>
          <p className="mt-1 font-display font-bold">משחק מספר {stub.number} שלך העונה</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
