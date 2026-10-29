'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { whileVisible } from '@/lib/while-visible'
import { countdownCells, countdownLabel } from '../schema'

/**
 * Time to kick-off, ticking every second while the page is visible. The clock is read only on the client (in an
 * effect), so the server HTML and the first client render match: both show dashes until the first tick.
 */
export function Countdown({ at }: { at: number }) {
  const t = useTranslations('home')
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const stop = whileVisible(() => {
      const tick = () => {
        setNow(Date.now())
      }
      const first = setTimeout(tick, 0)
      const every = setInterval(tick, 1000)
      return () => {
        clearTimeout(first)
        clearInterval(every)
      }
    })
    return () => {
      stop()
    }
  }, [])

  if (now !== null && at - now <= 0) return <span className="hm-cd-go">{t('matchStarted')}</span>
  // One big line like the sketch ("2 : 03 : 14"): days : hours : minutes, or hours : minutes : seconds under a day.
  const text = now === null ? '– : –– : ––' : countdownCells(at - now).map((c) => c.value).join(' : ')
  return (
    <span className="hm-cd" dir="ltr" role="timer" aria-label={now === null ? t('timeToKickoff') : t('kickoffIn', { label: countdownLabel(at - now) })}>
      <span aria-hidden="true">{text}</span>
    </span>
  )
}
