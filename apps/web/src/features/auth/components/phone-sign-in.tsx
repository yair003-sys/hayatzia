'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OTP_LENGTH, toE164Israel } from '../phone'
import { safeNext } from '../safe-next'

/** Sign in with a one-time SMS code (Supabase phone auth). */
export function PhoneSignIn() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = () => {
    const e164 = toE164Israel(phone)
    if (!e164) return setError(t('needIsraeliPhone'))
    start(async () => {
      setError(null)
      const { error: e } = await createClient().auth.signInWithOtp({ phone: e164 })
      if (e) return setError(t('sendCodeFailed'))
      setSentTo(e164)
    })
  }

  const verify = () => {
    if (!sentTo || code.length !== OTP_LENGTH) return
    start(async () => {
      const { error: e } = await createClient().auth.verifyOtp({ phone: sentTo, token: code, type: 'sms' })
      if (e) return setError(t('codeWrong'))
      // A scanned QR code sent the fan here with ?next=/add/<code>: back to that card (it sends new fans to sign-up).
      router.replace(safeNext(new URLSearchParams(window.location.search).get('next')) as Route)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {!sentTo ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            aria-label={t('phoneLabel')}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3.5 text-lg"
          />
          <button type="submit" disabled={pending} className="rounded-lg bg-accent px-5 font-bold text-white disabled:opacity-50">
            {pending ? '…' : t('sendCode')}
          </button>
        </form>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            verify()
          }}
        >
          <p className="text-sm text-muted">
            {t.rich('smsSentTo', { phone: sentTo, n: (c) => <span dir="ltr">{c}</span> })}
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={OTP_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="______"
            aria-label={t('codeLabel')}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3.5 text-center font-display text-2xl tracking-[0.5em]"
          />
          <button type="submit" disabled={pending || code.length !== OTP_LENGTH} className="w-full rounded-lg bg-accent py-3.5 font-bold text-white disabled:opacity-50">
            {pending ? t('checking') : t('enter')}
          </button>
          <button type="button" onClick={() => setSentTo(null)} className="w-full text-sm text-muted">
            {t('changeNumber')}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
