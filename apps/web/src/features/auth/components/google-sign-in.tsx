'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function GoogleSignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    const { error: e } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    })
    if (e) {
      setError('ההתחברות נכשלה. נסה שוב')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="w-full rounded-lg bg-white py-4 text-lg font-bold text-black transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? 'מעביר לגוגל…' : 'המשך עם Google'}
      </button>
      {error && (
        <p role="alert" className="text-center text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
