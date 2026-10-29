'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Siren } from 'lucide-react'
import { EMERGENCY_LABEL, EMERGENCY_NOTE } from '../ride-safety'
import { reportEmergencyAction } from '../server/emergency'

/**
 * "חירום – חיוג ל-100" on the ride card, for the driver and accepted riders during the ride (2026-10-16). A real tel:
 * link (56px), so the phone dials 100 even if the network or the app fails; the tap also alerts the onefan team in the
 * background, without delaying the call.
 */
export function EmergencyButton({ tripId }: { tripId: string }) {
  const t = useTranslations('teamLife')
  const [msg, setMsg] = useState<string | null>(null)
  const alertTeam = () => {
    void reportEmergencyAction({ tripId })
      .then((r) => {
        const error = r?.data?.error ?? r?.serverError
        if (error) setMsg(error)
        else setMsg(r?.data?.created ? t('teamAlerted') : t('teamAlreadyAlerted'))
      })
      .catch(() => setMsg(t('alertFailed')))
  }
  return (
    <div className="space-y-1.5">
      <a
        href="tel:100"
        onClick={alertTeam}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-live px-4 text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Siren className="size-6 shrink-0" aria-hidden="true" />
        {EMERGENCY_LABEL}
      </a>
      <p className="text-xs text-muted">{EMERGENCY_NOTE}</p>
      {msg && (
        <p role="status" className="text-xs font-medium">
          {msg}
        </p>
      )}
    </div>
  )
}
