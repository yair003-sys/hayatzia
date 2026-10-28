'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { LogOut } from 'lucide-react'
import { signOutAction } from '../server/actions'

/**
 * Signs out. First it reads this device's push subscription endpoint and unsubscribes the browser, passing the
 * endpoint to the server action so the matching push_subscriptions row is removed — a signed-out device must stop
 * getting notifications (security review 2026-10-17). If there is no push (or no JS), sign-out still works.
 */
export function SignOutButton() {
  const t = useTranslations('account')
  const [pending, start] = useTransition()
  const onClick = () =>
    start(async () => {
      const fd = new FormData()
      try {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            fd.set('endpoint', sub.endpoint)
            await sub.unsubscribe()
          }
        }
      } catch {
        // best effort: still sign out
      }
      await signOutAction(fd)
    })
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 font-medium text-muted disabled:opacity-50"
    >
      <LogOut className="size-4" aria-hidden="true" />
      {t('signOut')}
    </button>
  )
}
