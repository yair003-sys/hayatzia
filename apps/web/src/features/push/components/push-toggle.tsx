'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, BellOff } from 'lucide-react'
import { vapidKeyBytes } from '../schema'
import { removeSubscriptionAction, saveSubscriptionAction } from '../server/actions'

type State = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on'

/** Turns notifications on/off for this device. */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const t = useTranslations('push')
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported')
      if (Notification.permission === 'denied') return setState('blocked')
      const reg = await navigator.serviceWorker.ready
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off')
    })()
  }, [])

  const turnOn = () =>
    start(async () => {
      setError(null)
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'off')
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(vapidPublicKey) }))
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const r = await saveSubscriptionAction({ endpoint: json.endpoint, keys: json.keys })
      if (r.data?.ok) setState('on')
      else setError(r.data?.error ?? t('enableFailed'))
    })

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removeSubscriptionAction({ endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setState('off')
    })

  if (state === 'loading') return null
  if (state === 'unsupported') {
    return <p className="text-sm text-muted">{t('iosInstallFirst')}</p>
  }
  if (state === 'blocked') {
    return <p className="text-sm text-muted">{t('blocked')}</p>
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={state === 'on' ? turnOff : turnOn}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-3 font-semibold disabled:opacity-50"
      >
        {state === 'on' ? <BellOff className="size-5" aria-hidden="true" /> : <Bell className="size-5" aria-hidden="true" />}
        {state === 'on' ? t('turnOff') : t('turnOn')}
      </button>
      <p className="text-xs text-dim">{t('note')}</p>
      {error && <p role="alert" className="text-sm text-live">{error}</p>}
    </div>
  )
}
